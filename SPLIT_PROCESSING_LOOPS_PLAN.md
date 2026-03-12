# Plan: Split Processing Loops — Fix Forward-Visibility Gap

## Context

Phase C (narrative synthesis) currently runs inline with Phase A/B in a single per-chunk loop. This means Phase C for chunk N can only see actions from chunks 0..N — it has no visibility into actions extracted from future chunks. For tutorials where a concept at 02:00 is demonstrated via actions at 02:15 (in a different chunk), Phase C can't link them, causing broken coverage (~83.6%).

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

**Correctness notes:**
- Only `primaryEnd` and `clipEnd` of the preceding chunk are extended. `clipStart` stays correct (it already provides context before the original primary window).
- The `index` field on remaining chunks stays correct since we only ever remove the last element.
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

**Why 3 tests:** The original plan had 2 but missed the single-chunk edge case where `chunks.length < 2` must be guarded.

---

## Step 2: Add `narrationChunkSize` parameter & `narrationChunkIndex` state

### 2a. `server/jobManager.ts` — `JobState` interface

**Find** the `export interface JobState {` block. **Find** `currentChunkIndex: number;` inside it. Insert the following three fields **immediately after** `currentChunkIndex: number;`:

```typescript
  narrationChunkIndex: number;
  narrationChunkSize: number;
  narrationChunkCount: number;
```

### 2b. `server/jobManager.ts` — `processVideoJob` params

**Find** `export async function processVideoJob(params: {`. In that parameter object type, **find** the line `overlap: number;`. Insert the following **immediately after** `overlap: number;`:

```typescript
  narrationChunkSize?: number;
```

### 2c. `server/jobManager.ts` — Fresh state initialization

**Find** the `jobs.set(jobId, {` block inside the `if (!isResuming)` branch. **Find** `currentChunkIndex: 0,` inside that block. Insert the following three fields **immediately after** `currentChunkIndex: 0,`:

```typescript
      narrationChunkIndex: 0,
      narrationChunkSize: params.narrationChunkSize ?? Math.floor(params.chunkSize * 2.5),
      narrationChunkCount: 0,  // set after narration chunks are computed
```

### 2c-ii. `server/jobManager.ts` — `isResuming` validation

**Find** the `const isResuming = !!(...` expression (currently checks `existingState.videoUrl`, `chunkSize`, `overlap`, and `chunks.length > 0`). **Replace the entire `isResuming` declaration** with:

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

**Why:** Without this, a user could resume a cancelled job with a different `narrationChunkSize` (or omit it, getting a different default). `state.narrationChunkIndex` would point into the old layout, causing Phase C to resume from the wrong narration chunk — potentially re-narrating or skipping segments.

### 2d. `server/jobManager.ts` — `runJob` params

**Find** `async function runJob(jobId: string, params: {`. In that parameter object type, **find** the line `overlap: number;`. Insert the following **immediately after** `overlap: number;`:

```typescript
  narrationChunkSize?: number;
```

**No change needed** to the destructuring line (`const { videoUrl, durationInput, chunkSize, overlap, customContext, apiKey } = params;`) — Step 2e accesses `params.narrationChunkSize` directly to avoid shadowing the local `narrationChunkSize` variable it computes.

### 2e. `server/jobManager.ts` — Compute narration chunks

**Find** the closing brace `}` of the `if (!isResuming) { ... }` block (the block that calls `computeChunkWindows` and sets `state.chunks`). **Find** the line `let chatHistory: any[] = state.chatHistory || [];` that immediately follows. Insert the following block **between** them (after the `}`, before `let chatHistory`):

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

**Placement rationale:** Both fresh and resume paths have `duration`, `chunkSize`, `overlap` set before this point, so `narrationChunks` is always defined. The narration chunks are deterministic from the same inputs, so resume recomputes the identical layout.

**Math check for defaults (chunkSize=60, overlap=30):**
- narrationChunkSize = 150
- overlapRatio = 0.5, narrationOverlapRatio = 0.2
- narrationOverlap = round(150 * 0.2) = 30

### 2f. `server/jobManager.ts` — Add `formatMMSS` import

**Find** the import line:
```typescript
import { computeChunkWindows, parseMMSS } from '../utils/timeUtils.ts';
```
**Replace with:**
```typescript
import { computeChunkWindows, parseMMSS, formatMMSS } from '../utils/timeUtils.ts';
```

### 2g. `server.ts` — API endpoint

**Find** the destructuring line in the `/api/start-job` POST handler:
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

**Do NOT send `narrationChunkSize` from the client.** Since there is no UI slider for this value and it's purely derived from `chunkSize`, the server's `??`-based default should be the single source of truth. Sending a hardcoded `Math.floor(chunkSize * 2.5)` from the client would silently override any future server-side default changes, and would tie the `isResuming` validation to the client's constant rather than the server's canonical default.

The existing POST body remains unchanged — no `narrationChunkSize` field. The server computes it via `params.narrationChunkSize ?? Math.floor(chunkSize * 2.5)` when the field is absent. A `narrationChunkSize` field should only be added to the POST body when a user-facing UI control is introduced.

---

## Step 3: Convert first loop to Phase A/B only

This step makes **three changes** to the main `for` loop in `runJob`. Apply them in this order:

### 3a. Update progress scale from 0–100% to 0–50%

The A/B loop now represents only half the work. Two progress assignments must be updated:

**Change 1:** **Find** inside the `for` loop body:
```typescript
const progressBase = (i / state.chunks.length) * 100;
```
**Replace with:**
```typescript
const progressBase = (i / state.chunks.length) * 50;
```

**Change 2:** **Find** (after Phase A completes, before Phase B starts):
```typescript
state.progress = progressBase + (100 / state.chunks.length) * 0.3;
```
**Replace with:**
```typescript
state.progress = progressBase + (50 / state.chunks.length) * 0.3;
```

**Why:** Without these changes, `progressBase` uses the 0–100% scale, causing progress to peak at ~82.5% during A/B then jump backwards to 50% at the end-of-chunk commit.

### 3b. Delete Phase C from the loop body

**Find** the Phase C section that starts with:
```typescript
      // Phase C: Narrative Synthesis
      state.status = 'running_narrative';
      chunk.status = 'analyzing_phase_c';
```

**Delete everything** from that `// Phase C: Narrative Synthesis` comment through to (and including) the `bumpVersion(state);` that closes the loop body (the last line before the closing `}` of the `for` loop).

This removes: the Phase C `analyzeNarrationSegment` call + retry, `learned_insights` accumulation, step ID assignment, `cumulativeNarrative` append, the cancel check after Phase C, and the "Atomic state update" block that commits all chunk results.

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

**What's removed vs. kept:**

| Removed | Reason |
|---|---|
| Phase C `analyzeNarrationSegment` call + retry | Moved to Phase C loop |
| `learned_insights` accumulation | Moved to Phase C loop |
| Step ID assignment (`step_${uuidv4()}`) | Moved to Phase C loop |
| `cumulativeNarrative` append | Moved to Phase C loop |
| Cancel check after Phase C | Phase C has its own cancel checks now |

| Kept (reimplemented) | Notes |
|---|---|
| `chatHistory` commit | Identical |
| `chunkIndex` assignment on new actions/annotations | Identical |
| `chunk.phaseBAddedCount`, `chunk.actionCount`, `chunk.status` | Identical |
| UI state, actions, annotations commit | Identical, minus narrative |
| Progress, log, `currentChunkIndex`, `bumpVersion` | Progress formula changed to 0–50% range |

**Known trade-off:** In the original code, each chunk's Phase A/B benefited from `state.learnedContext` accumulated by previous chunks' Phase C runs (via `dynamicContext`). With the split, `state.learnedContext` is empty during the entire A/B loop. This is acceptable because:
- `customContext` (user-provided terminology guide) is always available
- Phase A is pure visual extraction; Phase B is validation/dedup — neither depends heavily on narrative insights
- The improvement in Phase C linking quality (from full action visibility) far outweighs the minor A/B context loss

---

## Step 4: Add Phase C loop after the A/B loop (with resume support)

**Find** the closing `}` of the main `for` loop (the A/B loop modified in Step 3). **Find** the comment block that follows it:
```typescript
    // After all chunks are processed, before global dedup
    // [Change 1a: broken-link cleanup]
```

Insert the following block **between** the loop's closing `}` and that comment (i.e., after the A/B loop ends, before the broken-link cleanup):

```typescript
    // === PHASE C LOOP: Narrative synthesis with full action visibility ===
    // Determine if we're resuming Phase C (A/B already complete, some narration chunks done)
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

**Resume design — how it works:**

The resume path is determined by two conditions:
1. `abComplete = state.currentChunkIndex >= state.chunks.length` — are all A/B chunks done?
2. `state.narrationChunkIndex > 0` — has Phase C made any progress?

| Scenario | `abComplete` | `narrationChunkIndex` | Behavior |
|---|---|---|---|
| Fresh start | N/A | 0 | A/B runs from 0, then Phase C from 0 (reset) |
| Resume: A/B incomplete | false | 0 | A/B resumes from `currentChunkIndex`, then Phase C from 0 (reset) |
| Resume: A/B done, Phase C not started | true | 0 | A/B loop skips, Phase C from 0 (reset — already clean) |
| Resume: Phase C partially done | true | >0 | A/B loop skips, Phase C resumes from `narrationChunkIndex`, preserves existing steps & learnedContext |

**Why this is safe:**
- `narrationChunks` is deterministic from `(duration, narrationChunkSize, narrationOverlap)` — same inputs produce the same chunk layout on resume
- `cumulativeNarrative` is preserved in `state.narrativeSteps` between resume cycles
- `state.learnedContext` is preserved, so resumed Phase C chunks benefit from prior insights
- `cumulativeActions` / `cumulativeAnnotations` are restored from `state.actions` / `state.annotations` (the `let cumulativeActions = ...` / `let cumulativeAnnotations = ...` lines after the `if (!isResuming)` block)
- The `cumulativeNarrative.slice(-10)` passed to `analyzeNarrationSegment` as `previousSteps` provides continuity context from preserved steps

**Key differences from the original inline Phase C:**

1. **Uses `nChunk` (narration chunk)** instead of `chunk` (A/B chunk) for time windows
2. **`relevantActions` filters from the FULL `cumulativeActions`** — this is the whole point of the split
3. **`dynamicContext` includes learned insights from prior narration chunks** — Phase C feeds itself
4. **Progress range is 50–90%** instead of part of the 0–100% per-chunk slice
5. **No chat history interaction** — Phase C doesn't use multi-turn context (it never did)
6. **Per-chunk resume via `state.narrationChunkIndex`** — follows the same pattern as A/B's `state.currentChunkIndex`

---

## Step 5: Verify progress alignment

The progress model is now:
- A/B loop: **0–50%** (`((i + 1) / state.chunks.length) * 50`)
- Phase C loop: **50–90%** (`50 + ((i + 1) / narrationChunks.length) * 40`)
- Phase D: **92–100%** (the existing `state.progress = 92;` line just before the `analyzeGlobalDeduplication` call)

Confirm `state.progress = 92;` is still present after the Phase C loop and before Phase D. **No change needed** — this line is outside both loops and remains untouched.

Note: Progress never moves backwards (unlike the current code where progress goes from ~100% down to 92% when Phase D starts).

On resume into Phase C, progress starts at `50 + (narrationStartIndex / narrationChunks.length) * 40` which correctly reflects the already-completed narration chunks.

---

## Step 6: Update ChunkVisualizer for Phase C feedback

### Problem
`ChunkVisualizer.tsx` actively renders the `analyzing_phase_c` status (indigo pulse + "NARRATING..." label). After the split, A/B chunks go `pending → analyzing_phase_a → analyzing_phase_b → completed` and never enter `analyzing_phase_c`. The user sees all chunks turn green at 50%, then progress moves to 90% with zero visual feedback during Phase C.

### 6a. `components/ChunkVisualizer.tsx` — Remove dead `analyzing_phase_c` rendering

**Find and delete** this line (the `analyzing_phase_c` color assignment):
```typescript
          if (chunk.status === 'analyzing_phase_c') colorClass = 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-200 dark:border-indigo-500 text-indigo-600 dark:text-indigo-300 animate-pulse';
```

**Find and delete** this line (the `analyzing_phase_c` status label):
```typescript
                {chunk.status === 'analyzing_phase_c' && 'NARRATING...'}
```

> **Note:** `'analyzing_phase_c'` is intentionally left in the `ChunkStatus` union in `types.ts` (out-of-scope). No code will set this value after the split. It can be repurposed for per-narration-chunk status in a future iteration, or removed in a dedicated cleanup PR.

### 6b. `components/ChunkVisualizer.tsx` — Add narration progress indicator

**Find** the interface declaration:
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

**Also update** the component's function signature to destructure the new props. **Find:**
```typescript
export const ChunkVisualizer: React.FC<ChunkVisualizerProps> = ({ chunks }) => {
```
**Replace with:**
```typescript
export const ChunkVisualizer: React.FC<ChunkVisualizerProps> = ({ chunks, narrationChunkIndex, narrationChunkCount, isNarrating }) => {
```

**Find** the closing `</div>` of the A/B chunk row (the `<div className="flex gap-2 min-w-max pb-2">` container). Insert the following narration indicator **immediately after** that closing `</div>`:
```typescript
      {isNarrating && narrationChunkCount != null && narrationChunkCount > 0 && (
        <div className="mt-3 flex items-center gap-2 text-xs text-indigo-600 dark:text-indigo-300 font-medium">
          <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></div>
          <span>Narrating segment {(narrationChunkIndex ?? 0) + 1} of {narrationChunkCount}...</span>
        </div>
      )}
```

### 6c. `components/AnalysisView.tsx` — Thread narration state to ChunkVisualizer

**Find** the state declarations near the top of the component (where `const [chunks, setChunks] = useState<Chunk[]>([]);` is declared). Add nearby:
```typescript
const [narrationChunkIndex, setNarrationChunkIndex] = useState(0);
const [narrationChunkCount, setNarrationChunkCount] = useState(0);
```

**Find** the polling response handler — the block that reads `state` from the polling response and calls `setChunks(state.chunks)`. **After** the `setChunks` call (or nearby, alongside other state updates), add:
```typescript
if (state.narrationChunkIndex !== undefined) setNarrationChunkIndex(state.narrationChunkIndex);
if (state.narrationChunkCount !== undefined) setNarrationChunkCount(state.narrationChunkCount);
```

**Find** the ChunkVisualizer render:
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

**Find** the legend section containing `Visual Raw` and `Visual Merge` spans. **After** the `Visual Merge` span, add a new narration legend entry:
```tsx
<span className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-indigo-500"></div> Narration</span>
```

---

## Summary of all changes to `JobState` interface

```typescript
export interface JobState {
  // ... existing fields ...
  currentChunkIndex: number;
  narrationChunkIndex: number;   // NEW — tracks Phase C progress for resume
  narrationChunkSize: number;    // NEW — stored for resume layout validation
  narrationChunkCount: number;   // NEW — total narration chunks, for frontend progress display
  // ... rest of existing fields ...
}
```

narrationChunkIndex: 0,
narrationChunkSize: params.narrationChunkSize ?? Math.floor(params.chunkSize * 2.5),
narrationChunkCount: 0,

`isResuming` guard now validates `narrationChunkSize` matches to prevent layout mismatch on resume.

No other change needed for the resume path — `narrationChunkIndex` retains its value from the interrupted run.

---

## Checklist of Gaps Fixed vs. Original Plan

| Gap | Fix | Source |
|---|---|---|
| Phase C not resumable | Added `narrationChunkIndex` to `JobState`, conditional reset, resume from saved index | Internal review |
| Test missing single-chunk edge case | Added 3rd test in Step 1b | Internal review |
| Test doesn't verify `clipStart` of folded chunk | Added `clipStart` assertion in test 1 | Internal review |
| Test 2 missing `clipStart`/`clipEnd` assertions | Added `clipStart`/`clipEnd` assertions to verify no-fold path doesn't mutate clip window | **Greptile #4** |
| `formatMMSS` import not called out as a step | Explicit Step 2f | Internal review |
| `dynamicContext` loses learned insights during A/B loop | Documented as known trade-off in Step 3 | Internal review |
| Frontend `narrationChunkSize` state variable unnecessary | Changed to inline computation (no useState) | Internal review |
| Original plan's replacement code lacked deletion boundaries | Explicit line-by-line mapping in Step 3 | Internal review |
| Progress formula regression: A/B mid-loop uses 0–100% scale | Updated `progressBase` and post-Phase-A progress to 0–50% scale in Step 3 | **Greptile #1** |
| `analyzing_phase_c` renders in ChunkVisualizer, not dead code | Removed dead rendering, added narration progress indicator (Step 6) | **Greptile #2** |
| `narrationChunkSize` not stored in `JobState` or validated on resume | Added to `JobState`, initialized in fresh-start, validated in `isResuming` guard (Step 2c-ii) | **Greptile #3** |
| `\|\|` / `??` inconsistency across init, runJob, and isResuming guard | Standardized all three sites to `??` (null/undefined only) | **Greptile #5** |
| Misleading cancel log "before Phase C" fires mid-loop | Changed to `Job cancelled before Phase C chunk ${i+1}/${total}` | **Greptile #6** |
| Dead `analyzing_phase_c` in `ChunkStatus` union (`types.ts`) | Added note in Step 6a: intentional out-of-scope tech debt, repurposable | **Greptile #7** |
| Client hardcodes server's `narrationChunkSize` default | Removed from POST body; server is single source of truth (Step 2h) | **Greptile #8** |

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
Verify no type errors, especially around the new `narrationChunkIndex` field on `JobState`.

### Manual test: Cuez tutorial (~3:43 = 223s)
Expected chunk layout:
- **A/B loop:** 4 chunks at 60s (boundaries 0, 60, 120, 180; with default 30s overlap)
- **Narration chunks before fold:** 2 chunks at 150s (0–150, 150–223)
- **After tail-fold:** 1 chunk (0–223) — the 73s tail (48.7% < 50%) folds

**Check:**
1. Log shows "Narration plan: 1 chunks (150s window, 30s overlap)"
2. All A/B chunks complete first (4 "Phase A/B complete" logs), THEN "Starting narrative synthesis" appears
3. Steps about "Create a custom Cue Block template" and "Add a hidden media field" now link to the 02:00–02:20 actions
4. Coverage >= 90% (previous: 83.6%)
5. 0 timestamp regressions, 0 duplicate actions
6. `learnedContext` populated after Phase C
7. Progress bar never goes backwards (0→50→90→92→100)
8. ChunkVisualizer shows "Narrating segment 1 of 1..." with indigo pulse during Phase C
9. No "NARRATING..." label appears on any A/B chunk tile

### Resume test
1. Start a job, cancel during Phase C (after at least one narration chunk completes)
2. Resume the job
3. Verify log shows "Resuming Phase C from narration chunk N" with correct N
4. Verify preserved narrative steps are not regenerated (no duplicates)
5. Verify `learnedContext` carries over from the completed narration chunks
6. Verify final output is identical to a non-interrupted run

### Edge case: Videos >10 min
- Verify step quality holds with wider narration chunks
- The 480s LLM timeout in `geminiService.ts` should be sufficient since Phase C processes pre-extracted action lists, not raw video frames
- If narration chunks become very dense (>50 actions), the LLM output may approach `maxOutputTokens: 100000` but this is generous
