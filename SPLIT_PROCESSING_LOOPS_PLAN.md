# Plan: Split Processing Loops — Fix Forward-Visibility Gap

## Context

Phase C (narrative synthesis) currently runs inline with Phase A/B in a single per-chunk loop. Phase C for chunk N can only see actions from chunks 0..N — it has no visibility into actions extracted from future chunks. For tutorials where a concept at 02:00 is demonstrated via actions at 02:15 (in a different chunk), Phase C can't link them, causing broken coverage (~83.6%).

**Goal:** Split into two sequential loops — first extract ALL actions (Phase A/B), then narrate with full action visibility (Phase C) using wider, non-aligned chunks. Phase C is resumable per-chunk, following the same pattern as Phase A/B.

**Before:** `for each 60s chunk: A → B → C`
**After:** `for each 60s chunk: A → B` then `for each 150s chunk: C (sees all actions)`

---

## Files Modified

| File | Change |
|---|---|
| `utils/timeUtils.ts` | Add tail-folding to `computeChunkWindows` |
| `utils/timeUtils.test.ts` | Add 3 test cases for tail-folding |
| `server/jobManager.ts` | Split loop, add narration chunk computation, add `narrationChunkIndex` to state, add `formatMMSS` import, Phase C resume logic |
| `server.ts` | Pass `narrationChunkSize` through API endpoint |
| `components/AnalysisView.tsx` | Thread narration chunk state to ChunkVisualizer |
| `components/ChunkVisualizer.tsx` | Add narration chunk progress row for Phase C |

**Do NOT modify:** `geminiService.ts`, `constants.ts`, `utils/jsonOptimize.ts`, `types.ts`

---

## Step 1: Tail-folding in `computeChunkWindows`

### 1a. `utils/timeUtils.ts`

**Find** the line `return chunks;` at the end of `computeChunkWindows`. Insert the following block **immediately before** that `return chunks;` line:

```typescript
  // Fold short tail: a chunk under 50% of target size isn't worth a separate LLM call
  const minChunkDuration = chunkSizeSec * 0.5;
  if (chunks.length >= 2) {
    const last = chunks[chunks.length - 1];
    const lastPrimaryDuration = last.primaryEnd - last.primaryStart;
    if (lastPrimaryDuration < minChunkDuration) {
      const prev = chunks[chunks.length - 2];
      prev.primaryEnd = last.primaryEnd;
      prev.clipEnd = last.clipEnd;
      chunks.pop();
    }
  }
```

Notes:
- Only `primaryEnd` and `clipEnd` of the preceding chunk are extended. `clipStart` stays correct.
- The `index` field stays correct since we only ever remove the last element.
- The fold threshold uses strict `<` (50% exactly is kept, not folded).

### 1b. `utils/timeUtils.test.ts`

Add inside the `computeChunkWindows` describe block (after the existing two tests):

```typescript
    it('should fold short tail chunks into the preceding chunk', () => {
      // 190s / 60s = chunks at 0-60, 60-120, 120-180, 180-190
      // Last chunk is 10s = 16.7% of 60 → folds into chunk 2
      const chunks = computeChunkWindows(190, 60, 10);
      expect(chunks).toHaveLength(3);
      const last = chunks[chunks.length - 1];
      expect(last.primaryStart).toBe(120);
      expect(last.primaryEnd).toBe(190);
      expect(last.clipStart).toBe(110); // unchanged from original chunk 2
      expect(last.clipEnd).toBe(190);
    });

    it('should keep tail chunks at 50% or more of chunk size', () => {
      // 210s / 60s = chunks at 0-60, 60-120, 120-180, 180-210
      // Last chunk is 30s = exactly 50% → NOT folded (strict <)
      const chunks = computeChunkWindows(210, 60, 10);
      expect(chunks).toHaveLength(4);
      expect(chunks[3].primaryStart).toBe(180);
      expect(chunks[3].primaryEnd).toBe(210);
      expect(chunks[3].clipStart).toBe(170); // 180 - 10 overlap
      expect(chunks[3].clipEnd).toBe(210);   // capped at duration
    });

    it('should not fold when there is only one chunk', () => {
      const chunks = computeChunkWindows(20, 60, 10);
      expect(chunks).toHaveLength(1);
      expect(chunks[0].primaryEnd).toBe(20);
    });
```

The third test guards the `chunks.length >= 2` check — without it, a single-chunk video would erroneously attempt to fold.

---

## Step 2: Add `narrationChunkSize` parameter & `narrationChunkIndex` state

### 2a. `server/jobManager.ts` — `JobState` interface

**Find** the `export interface JobState {` block. **Find** `currentChunkIndex: number;` inside it. Insert **immediately after** `currentChunkIndex: number;`:

```typescript
  narrationChunkIndex: number;
  narrationChunkSize: number;
  narrationChunkCount: number;
```

### 2b. `server/jobManager.ts` — `processVideoJob` params

**Find** `export async function processVideoJob(params: {`. In that parameter object type, **find** `overlap: number;`. Insert **immediately after** it:

```typescript
  narrationChunkSize?: number;
```

### 2c. `server/jobManager.ts` — Fresh state initialization

**Find** the `jobs.set(jobId, {` block inside the `if (!isResuming)` branch. **Find** `currentChunkIndex: 0,` inside that block. Insert **immediately after** it:

```typescript
      narrationChunkIndex: 0,
      narrationChunkSize: params.narrationChunkSize ?? Math.floor(params.chunkSize * 2.5),
      narrationChunkCount: 0,  // set after narration chunks are computed
```

### 2c-ii. `server/jobManager.ts` — `isResuming` validation

**Find** the `const isResuming = !!(...` expression. **Replace the entire declaration** with:

```typescript
  const isResuming = !!(existingState &&
                     (existingState.status === 'cancelled' || existingState.status === 'error') &&
                     existingState.videoUrl === params.videoUrl &&
                     existingState.chunkSize === params.chunkSize &&
                     existingState.overlap === params.overlap &&
                     existingState.narrationChunkSize ===
                       (params.narrationChunkSize ?? Math.floor(params.chunkSize * 2.5)) &&
                     existingState.chunks.length > 0);
```

This prevents resuming with a different `narrationChunkSize`, which would cause `narrationChunkIndex` to point into the wrong layout.

### 2d. `server/jobManager.ts` — `runJob` params

**Find** `async function runJob(jobId: string, params: {`. In that parameter object type, **find** `overlap: number;`. Insert **immediately after** it:

```typescript
  narrationChunkSize?: number;
```

**No change needed** to the destructuring line (`const { videoUrl, durationInput, chunkSize, overlap, customContext, apiKey } = params;`) — Step 2e accesses `params.narrationChunkSize` directly to avoid shadowing the local `narrationChunkSize` variable it computes.

### 2e. `server/jobManager.ts` — Compute narration chunks

**Find** the closing `}` of the `if (!isResuming) { ... }` block (the block that calls `computeChunkWindows` and sets `state.chunks`). **Find** `let chatHistory: any[] = state.chatHistory || [];` that immediately follows. Insert **between** them:

```typescript
    // Narration chunks: wider windows, non-aligned with A/B, reduced overlap
    const narrationChunkSize = params.narrationChunkSize ?? Math.floor(chunkSize * 2.5);
    const overlapRatio = overlap / chunkSize;
    const narrationOverlapRatio = overlapRatio * 0.4;
    const narrationOverlap = Math.round(narrationChunkSize * narrationOverlapRatio);
    const narrationChunks = computeChunkWindows(duration, narrationChunkSize, narrationOverlap);
    state.narrationChunkCount = narrationChunks.length;
    addLog('info', `Narration plan: ${narrationChunks.length} chunks (${narrationChunkSize}s window, ${narrationOverlap}s overlap)`);
```

This placement works for both fresh and resume paths since `duration`, `chunkSize`, `overlap` are set before this point. The narration chunks are deterministic from the same inputs, so resume recomputes the identical layout.

**Expected values for defaults (chunkSize=60, overlap=30):** narrationChunkSize=150, overlapRatio=0.5, narrationOverlapRatio=0.2, narrationOverlap=30.

### 2f. `server/jobManager.ts` — Add `formatMMSS` import

**Find:**
```typescript
import { computeChunkWindows, parseMMSS } from '../utils/timeUtils.ts';
```
**Replace with:**
```typescript
import { computeChunkWindows, parseMMSS, formatMMSS } from '../utils/timeUtils.ts';
```

### 2g. `server.ts` — API endpoint

**Find** the destructuring in the `/api/start-job` POST handler:
```typescript
const { jobId: reqJobId, videoUrl, durationInput, chunkSize, overlap, customContext } = req.body;
```
**Replace with:**
```typescript
const { jobId: reqJobId, videoUrl, durationInput, chunkSize, overlap, narrationChunkSize, customContext } = req.body;
```

**Find** the `processVideoJob` call:
```typescript
const jobId = await processVideoJob({ jobId: reqJobId, videoUrl, durationInput, chunkSize, overlap, customContext, apiKey });
```
**Replace with:**
```typescript
const jobId = await processVideoJob({ jobId: reqJobId, videoUrl, durationInput, chunkSize, overlap, narrationChunkSize, customContext, apiKey });
```

### 2h. `components/AnalysisView.tsx` — POST body

**Do NOT send `narrationChunkSize` from the client.** No UI control exists for it. The server computes the default via `params.narrationChunkSize ?? Math.floor(chunkSize * 2.5)`. The existing POST body remains unchanged.

---

## Step 3: Convert first loop to Phase A/B only

This step makes **three changes** to the main `for` loop in `runJob`. Apply them in this order:

### 3a. Update progress scale from 0–100% to 0–50%

**Change 1:** **Find** inside the `for` loop body:
```typescript
const progressBase = (i / state.chunks.length) * 100;
```
**Replace with:**
```typescript
const progressBase = (i / state.chunks.length) * 50;
```

**Change 2:** **Find** (after Phase A, before Phase B):
```typescript
state.progress = progressBase + (100 / state.chunks.length) * 0.3;
```
**Replace with:**
```typescript
state.progress = progressBase + (50 / state.chunks.length) * 0.3;
```

**Why both changes are critical:** Without them, `progressBase` uses the 0–100% scale, causing progress to peak at ~82.5% during A/B then jump backwards to 50% at the end-of-chunk commit.

### 3b. Delete Phase C from the loop body

**Find** the Phase C section that starts with:
```typescript
      // Phase C: Narrative Synthesis
      state.status = 'running_narrative';
      chunk.status = 'analyzing_phase_c';
```

**Delete everything** from that `// Phase C: Narrative Synthesis` comment through to (and including) the `bumpVersion(state);` that closes the loop body (the last line before the closing `}` of the `for` loop).

This deletion range includes: the Phase C `analyzeNarrationSegment` call + retry logic, `learned_insights` accumulation, step ID assignment (`step_${uuidv4()}`), `cumulativeNarrative` append, the cancel check after Phase C, and the "Atomic state update" block that commits all chunk results. All of these are either moved to the Phase C loop (Step 4) or reimplemented below.

### 3c. Insert A/B-only state commit

**In place of the deleted code** (at the end of the loop body, after the annotation validation block ending with `let nextCumulativeAnnotations = [...cumulativeAnnotations, ...newValidatedAnnotations];`), insert:

```typescript
      // --- Commit Phase A/B results ---
      chatHistory = nextChatHistory;
      state.chatHistory = chatHistory;

      const newActionsCount = nextCumulativeActions.length - cumulativeActions.length;
      for (let j = cumulativeActions.length; j < nextCumulativeActions.length; j++) {
        nextCumulativeActions[j].chunkIndex = i;
      }
      for (let j = cumulativeAnnotations.length; j < nextCumulativeAnnotations.length; j++) {
        nextCumulativeAnnotations[j].chunkIndex = i;
      }

      chunk.phaseBAddedCount = newActionsCount;
      chunk.actionCount = newActionsCount;
      chunk.status = 'completed';

      latestUIState = nextUIState;
      state.uiState = latestUIState;

      cumulativeActions = nextCumulativeActions;
      state.actions = cumulativeActions;

      cumulativeAnnotations = nextCumulativeAnnotations;
      state.annotations = cumulativeAnnotations;

      state.progress = ((i + 1) / state.chunks.length) * 50;
      state.currentChunkIndex = i + 1;
      addLog('success', `Chunk ${i + 1}/${state.chunks.length} Phase A/B complete. ${newActionsCount} new actions.`);
      bumpVersion(state);
```

**What Step 3b removed vs. what Step 3c reimplements:**

| Removed (moved to Phase C loop in Step 4) | Reimplemented in 3c |
|---|---|
| `analyzeNarrationSegment` call + retry | `chatHistory` commit |
| `learned_insights` accumulation | `chunkIndex` assignment on new actions/annotations |
| Step ID assignment (`step_${uuidv4()}`) | `chunk.phaseBAddedCount`, `chunk.actionCount`, `chunk.status` |
| `cumulativeNarrative` append | UI state, actions, annotations commit (minus narrative) |
| Cancel check after Phase C | Progress (0–50% formula), log, `currentChunkIndex`, `bumpVersion` |

**Known trade-off:** `state.learnedContext` is empty during the entire A/B loop (previously it accumulated from Phase C). This is acceptable — Phase A/B are pure extraction/validation and don't depend heavily on narrative insights. `customContext` remains available.

---

## Step 4: Add Phase C loop after the A/B loop (with resume support)

**Find** the closing `}` of the main `for` loop (the A/B loop from Step 3). **Find** the comment that follows it:
```typescript
    // After all chunks are processed, before global dedup
    // [Change 1a: broken-link cleanup]
```

Insert the following block **between** the loop's closing `}` and that comment:

```typescript
    // === PHASE C LOOP: Narrative synthesis with full action visibility ===
    const abComplete = state.currentChunkIndex >= state.chunks.length;
    const resumingPhaseC = isResuming && abComplete && state.narrationChunkIndex > 0;

    if (resumingPhaseC) {
      addLog('info', `Resuming Phase C from narration chunk ${state.narrationChunkIndex + 1}/${narrationChunks.length}. Preserving ${cumulativeNarrative.length} existing steps.`);
    } else {
      // Fresh Phase C — reset narrative to avoid duplicates
      cumulativeNarrative = [];
      state.narrativeSteps = cumulativeNarrative;
      state.learnedContext = "";
      state.narrationChunkIndex = 0;
    }

    const narrationStartIndex = resumingPhaseC ? state.narrationChunkIndex : 0;

    addLog('info', `Starting narrative synthesis: ${narrationChunks.length} narration chunks (starting at ${narrationStartIndex + 1}), ${cumulativeActions.length} total actions available.`);

    for (let i = narrationStartIndex; i < narrationChunks.length; i++) {
      if (cancelTokens.has(jobId)) {
        state.status = 'cancelled';
        bumpVersion(state);
        addLog('warn', `Job cancelled before Phase C chunk ${i + 1}/${narrationChunks.length}`);
        return;
      }

      const nChunk = narrationChunks[i];
      state.status = 'running_narrative';
      bumpVersion(state);
      addLog('info', `Phase C (${i + 1}/${narrationChunks.length}): Narrating ${formatMMSS(nChunk.primaryStart)}–${formatMMSS(nChunk.primaryEnd)}...`);

      const dynamicContext = customContext + (state.learnedContext ? "\n\nLearned Domain Knowledge:\n" + state.learnedContext : "");

      const CONTEXT_BUFFER_SEC = 15;
      const contextStart = nChunk.clipStart - CONTEXT_BUFFER_SEC;
      const contextEnd = nChunk.clipEnd + CONTEXT_BUFFER_SEC;

      const relevantActions = cumulativeActions.filter(a => {
        const t = parseMMSS(a.timestamp);
        return t >= contextStart && t <= contextEnd;
      });

      const relevantAnnotations = cumulativeAnnotations.filter(a => {
        const t = parseMMSS(a.timestamp);
        return t >= contextStart && t <= contextEnd;
      });

      let narrationResult = await analyzeNarrationSegment(
        videoUrl,
        nChunk.clipStart,
        nChunk.clipEnd,
        relevantActions,
        relevantAnnotations,
        dynamicContext,
        apiKey,
        cumulativeNarrative.slice(-10),
        addLog
      );

      // Retry once if empty steps but we had relevant actions
      if (narrationResult.steps.length === 0 && relevantActions.length > 0) {
        addLog('warn', `Phase C returned 0 steps despite having ${relevantActions.length} actions. Retrying...`);
        narrationResult = await analyzeNarrationSegment(
          videoUrl,
          nChunk.clipStart,
          nChunk.clipEnd,
          relevantActions,
          relevantAnnotations,
          dynamicContext,
          apiKey,
          cumulativeNarrative.slice(-10),
          addLog
        );
        if (narrationResult.steps.length > 0) {
          addLog('success', `Phase C retry yielded ${narrationResult.steps.length} steps.`);
        } else {
          addLog('warn', `Phase C retry also returned 0 steps. Actions in this range may be unlinked.`);
        }
      }

      if (cancelTokens.has(jobId)) {
        state.status = 'cancelled';
        bumpVersion(state);
        addLog('warn', `Job cancelled during Phase C (${i + 1}/${narrationChunks.length})`);
        return;
      }

      const newNarrativeStepsRaw = narrationResult.steps;
      const learned_insights = narrationResult.learned_insights;

      // Accumulate learned context (with dedup)
      if (learned_insights) {
        const currentInsights = state.learnedContext
          ? state.learnedContext.split('\n- ').map(ins => ins.replace(/^- /, '').trim().toLowerCase())
          : [];
        const newInsights = learned_insights.split('\n- ').map(ins => ins.replace(/^- /, '').trim());

        let insightsAdded = false;
        for (const insight of newInsights) {
          if (insight && !currentInsights.includes(insight.toLowerCase())) {
            state.learnedContext = (state.learnedContext ? state.learnedContext + "\n- " : "- ") + insight;
            insightsAdded = true;
          }
        }
        if (insightsAdded) bumpVersion(state);
      }

      // Assign step IDs
      const existingStepIds = new Set(cumulativeNarrative.map(s => s.id));
      const newNarrativeSteps = newNarrativeStepsRaw.map(step => {
        step.id = `step_${uuidv4().substring(0, 8)}`;
        existingStepIds.add(step.id);
        return step;
      });

      cumulativeNarrative = [...cumulativeNarrative, ...newNarrativeSteps];
      state.narrativeSteps = cumulativeNarrative;

      // Commit Phase C progress for resumability
      state.narrationChunkIndex = i + 1;
      state.progress = 50 + ((i + 1) / narrationChunks.length) * 40;
      addLog('success', `Phase C (${i + 1}/${narrationChunks.length}): ${newNarrativeSteps.length} steps.`);
      bumpVersion(state);
    }
```

**Resume behavior:**

| Scenario | `abComplete` | `narrationChunkIndex` | Behavior |
|---|---|---|---|
| Fresh start | N/A | 0 | A/B from 0, then Phase C from 0 (reset) |
| Resume: A/B incomplete | false | 0 | A/B resumes, then Phase C from 0 (reset) |
| Resume: A/B done, Phase C not started | true | 0 | A/B skips, Phase C from 0 |
| Resume: Phase C partially done | true | >0 | A/B skips, Phase C resumes, preserves existing steps & learnedContext |

**Why resume is safe:**
- `narrationChunks` is deterministic from `(duration, narrationChunkSize, narrationOverlap)` — same inputs produce the same layout on resume
- `cumulativeNarrative` is preserved in `state.narrativeSteps`; `state.learnedContext` is preserved for resumed chunks
- `cumulativeActions`/`cumulativeAnnotations` are restored from `state.actions`/`state.annotations` (the `let cumulativeActions = ...` lines after the `if (!isResuming)` block)
- `cumulativeNarrative.slice(-10)` passed as `previousSteps` provides continuity context from preserved steps

---

## Step 5: Verify progress alignment

The progress model:
- A/B loop: **0–50%**
- Phase C loop: **50–90%**
- Phase D: **92–100%** (the existing `state.progress = 92;` before `analyzeGlobalDeduplication`)

Confirm `state.progress = 92;` is still present after the Phase C loop. **No change needed.**

**Invariant:** Progress must never move backwards. On resume into Phase C, progress starts at `50 + (narrationStartIndex / narrationChunks.length) * 40`, correctly reflecting already-completed narration chunks.

---

## Step 6: Update ChunkVisualizer for Phase C feedback

After the split, A/B chunks never enter `analyzing_phase_c`. Without changes, the user sees zero visual feedback during Phase C (50–90% of progress).

### 6a. `components/ChunkVisualizer.tsx` — Remove dead `analyzing_phase_c` rendering

**Find and delete** this line:
```typescript
          if (chunk.status === 'analyzing_phase_c') colorClass = 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-200 dark:border-indigo-500 text-indigo-600 dark:text-indigo-300 animate-pulse';
```

**Find and delete** this line:
```typescript
                {chunk.status === 'analyzing_phase_c' && 'NARRATING...'}
```

Leave `'analyzing_phase_c'` in the `ChunkStatus` union in `types.ts` — that file is out of scope.

### 6b. `components/ChunkVisualizer.tsx` — Add narration progress indicator

**Find:**
```typescript
interface ChunkVisualizerProps {
  chunks: Chunk[];
}
```
**Replace with:**
```typescript
interface ChunkVisualizerProps {
  chunks: Chunk[];
  narrationChunkIndex?: number;
  narrationChunkCount?: number;
  isNarrating?: boolean;
}
```

**Find:**
```typescript
export const ChunkVisualizer: React.FC<ChunkVisualizerProps> = ({ chunks }) => {
```
**Replace with:**
```typescript
export const ChunkVisualizer: React.FC<ChunkVisualizerProps> = ({ chunks, narrationChunkIndex, narrationChunkCount, isNarrating }) => {
```

**Find** the closing `</div>` of the A/B chunk row (the `<div className="flex gap-2 min-w-max pb-2">` container). Insert **immediately after** that closing `</div>`:
```typescript
      {isNarrating && narrationChunkCount != null && narrationChunkCount > 0 && (
        <div className="mt-3 flex items-center gap-2 text-xs text-indigo-600 dark:text-indigo-300 font-medium">
          <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></div>
          <span>Narrating segment {Math.min((narrationChunkIndex ?? 0) + 1, narrationChunkCount)} of {narrationChunkCount}...</span>
        </div>
      )}
```

### 6c. `components/AnalysisView.tsx` — Thread narration state to ChunkVisualizer

**Find** the state declarations near the top (where `const [chunks, setChunks] = useState<Chunk[]>([]);` is). Add nearby:
```typescript
const [narrationChunkIndex, setNarrationChunkIndex] = useState(0);
const [narrationChunkCount, setNarrationChunkCount] = useState(0);
```

**Find** the polling response handler that calls `setChunks(state.chunks)`. **After** it, add:
```typescript
if (state.narrationChunkIndex !== undefined) setNarrationChunkIndex(state.narrationChunkIndex);
if (state.narrationChunkCount !== undefined) setNarrationChunkCount(state.narrationChunkCount);
```

**Find:**
```tsx
<ChunkVisualizer chunks={chunks} />
```
**Replace with:**
```tsx
<ChunkVisualizer
  chunks={chunks}
  narrationChunkIndex={narrationChunkIndex}
  narrationChunkCount={narrationChunkCount}
  isNarrating={procState.status === 'running_narrative'}
/>
```

### 6d. Update the legend in ChunkVisualizer

**Find** the legend section containing `Visual Raw` and `Visual Merge` spans. **After** the `Visual Merge` span, add:
```tsx
<span className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-indigo-500"></div> Narration</span>
```

---

## Verification

### Automated tests
```bash
npx vitest run utils/timeUtils.test.ts
```
All 5 `computeChunkWindows` tests should pass (2 existing + 3 new).

### TypeScript compilation
```bash
npx tsc --noEmit
```

### Manual test: Cuez tutorial (~3:43 = 223s)
Expected chunk layout:
- **A/B loop:** 4 chunks at 60s (boundaries 0, 60, 120, 180; with default 30s overlap)
- **Narration chunks:** 2 at 150s (0–150, 150–223), tail-folds to 1 chunk (73s = 48.7% < 50%)

Checks:
1. Log shows "Narration plan: 1 chunks (150s window, 30s overlap)"
2. All A/B chunks complete first, THEN "Starting narrative synthesis" appears
3. Coverage >= 90%
4. 0 duplicate actions
5. Progress bar never goes backwards (0→50→90→92→100)
6. ChunkVisualizer shows "Narrating segment 1 of 1..." with indigo pulse during Phase C
7. No "NARRATING..." label appears on any A/B chunk tile

### Resume test
1. Start a job, cancel during Phase C (after at least one narration chunk completes)
2. Resume — verify log shows "Resuming Phase C from narration chunk N"
3. Verify no duplicate narrative steps
4. Verify `learnedContext` carries over
