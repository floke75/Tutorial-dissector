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
| `components/AnalysisView.tsx` | Include `narrationChunkSize` in POST body |

**Do NOT modify:** `geminiService.ts`, `constants.ts`, `utils/jsonOptimize.ts`, `types.ts`

---

## Step 1: Tail-folding in `computeChunkWindows`

### 1a. `utils/timeUtils.ts`

Insert BEFORE `return chunks;` (line 59):

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

### 2a. `server/jobManager.ts` — `JobState` interface (line 8)

Add `narrationChunkIndex` to the `JobState` interface. Insert after `currentChunkIndex: number;` (line 22):

```typescript
  narrationChunkIndex: number;
```

### 2b. `server/jobManager.ts` — `processVideoJob` params (line 86)

Add between `overlap` and `customContext`:

```typescript
  narrationChunkSize?: number;
```

### 2c. `server/jobManager.ts` — Fresh state initialization (line 108)

In the `jobs.set(jobId, { ... })` block, add after `currentChunkIndex: 0,` (line 121):

```typescript
      narrationChunkIndex: 0,
```

### 2d. `server/jobManager.ts` — `runJob` params (line 177)

Same change — add `narrationChunkSize?: number;` between `overlap` and `customContext`.

### 2e. `server/jobManager.ts` — Compute narration chunks

Insert AFTER the `if (!isResuming) { ... }` block closes (line 261) and BEFORE `let chatHistory: any[] = state.chatHistory || [];` (line 263):

```typescript
    // Narration chunks: wider windows, non-aligned with A/B, reduced overlap
    const narrationChunkSize = params.narrationChunkSize || Math.floor(chunkSize * 2.5);
    const overlapRatio = overlap / chunkSize;
    const narrationOverlapRatio = overlapRatio * 0.4;
    const narrationOverlap = Math.round(narrationChunkSize * narrationOverlapRatio);
    const narrationChunks = computeChunkWindows(duration, narrationChunkSize, narrationOverlap);
    addLog('info', `Narration plan: ${narrationChunks.length} chunks (${narrationChunkSize}s window, ${narrationOverlap}s overlap)`);
```

**Placement rationale:** Both fresh and resume paths have `duration`, `chunkSize`, `overlap` set before this point, so `narrationChunks` is always defined. The narration chunks are deterministic from the same inputs, so resume recomputes the identical layout.

**Math check for defaults (chunkSize=60, overlap=30):**
- narrationChunkSize = 150
- overlapRatio = 0.5, narrationOverlapRatio = 0.2
- narrationOverlap = round(150 * 0.2) = 30

### 2f. `server/jobManager.ts` — Add `formatMMSS` import

Change line 4 from:
```typescript
import { computeChunkWindows, parseMMSS } from '../utils/timeUtils.ts';
```
to:
```typescript
import { computeChunkWindows, parseMMSS, formatMMSS } from '../utils/timeUtils.ts';
```

### 2g. `server.ts` — API endpoint (line 51)

Change destructuring:
```typescript
const { jobId: reqJobId, videoUrl, durationInput, chunkSize, overlap, narrationChunkSize, customContext } = req.body;
```

Pass through to `processVideoJob` (line 78):
```typescript
const jobId = await processVideoJob({ jobId: reqJobId, videoUrl, durationInput, chunkSize, overlap, narrationChunkSize, customContext, apiKey });
```

### 2h. `components/AnalysisView.tsx` — POST body

In the `handleStartAnalysis` function (~line 613), add `narrationChunkSize` to the POST body. Compute it inline:

```typescript
body: JSON.stringify({
  jobId: projectId,
  videoUrl,
  durationInput,
  chunkSize,
  overlap,
  narrationChunkSize: Math.floor(chunkSize * 2.5),
  customContext,
  apiKey: currentApiKey
})
```

No `useState` needed — computed inline from `chunkSize`. No UI slider needed — the server has a fallback default anyway.

---

## Step 3: Convert first loop to Phase A/B only

In `server/jobManager.ts`, inside the `for` loop body, locate the Phase C section starting at line 398:

```typescript
      // Phase C: Narrative Synthesis
      state.status = 'running_narrative';
      chunk.status = 'analyzing_phase_c';
```

**Delete** everything from line 398 through line 509 (the `bumpVersion(state);` at the end of the loop body).

**Replace** with (this is the A/B-only state commit):

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
| Cancel check after Phase C (lines 470-475) | Phase C has its own cancel checks now |

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

Locate after the first loop closes (line 510 in the original, will shift after edits):

```typescript
    // After all chunks are processed, before global dedup
    // [Change 1a: broken-link cleanup]
```

Insert BEFORE it:

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
        addLog('warn', 'Job cancelled before Phase C');
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
- `cumulativeActions` / `cumulativeAnnotations` are restored from `state.actions` / `state.annotations` (line 264-265)
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
- Phase D: **92–100%** (existing `state.progress = 92` at line 647, then `onProgress` callback)

Confirm `state.progress = 92` (current line 647) is still present after the Phase C loop and before Phase D. **No change needed** — this line is outside both loops and remains untouched.

Note: Progress never moves backwards (unlike the current code where progress goes from ~100% down to 92% when Phase D starts).

On resume into Phase C, progress starts at `50 + (narrationStartIndex / narrationChunks.length) * 40` which correctly reflects the already-completed narration chunks.

---

## Summary of all changes to `JobState` interface

```typescript
export interface JobState {
  // ... existing fields ...
  currentChunkIndex: number;
  narrationChunkIndex: number;  // NEW — tracks Phase C progress for resume
  // ... rest of existing fields ...
}
```

Initialization in `processVideoJob` fresh-start block:
```typescript
narrationChunkIndex: 0,
```

No change needed for the `isResuming` resume path — `narrationChunkIndex` retains its value from the interrupted run.

---

## Checklist of Gaps Fixed vs. Original Plan

| Gap | Fix |
|---|---|
| Phase C not resumable | Added `narrationChunkIndex` to `JobState`, conditional reset, resume from saved index |
| Test missing single-chunk edge case | Added 3rd test in Step 1b |
| Test doesn't verify `clipStart` of folded chunk | Added `clipStart` assertion |
| `formatMMSS` import not called out as a step | Explicit Step 2f |
| `dynamicContext` loses learned insights during A/B loop | Documented as known trade-off in Step 3 |
| Frontend `narrationChunkSize` state variable unnecessary | Changed to inline computation (no useState) |
| Original plan's replacement code lacked deletion boundaries | Explicit line-by-line mapping in Step 3 |
| `analyzing_phase_c` chunk status becomes dead code | Acceptable — type still valid, just unused. No change to `types.ts` |

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
