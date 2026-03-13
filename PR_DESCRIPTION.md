# Pull Request: Split Processing Loops — Fix Forward-Visibility Gap

## 🎯 Motivation & Context
**The Problem:** Previously, Phase C (narrative synthesis) ran inline with Phase A/B in a single per-chunk loop. Because of this, Phase C for chunk `N` only had visibility into actions extracted from chunks `0..N`. It had zero visibility into actions extracted from future chunks. For tutorials where a concept introduced at 02:00 is demonstrated via actions at 02:15 (in a subsequent chunk), Phase C couldn't link them, resulting in broken coverage (~83.6% link coverage).

**The Solution:** Split the pipeline into two sequential loops. 
1. **Loop 1 (Phase A/B):** Extract and validate ALL actions and annotations across the entire video.
2. **Loop 2 (Phase C):** Perform narrative synthesis using wider, non-aligned chunks (e.g., 150s), giving the LLM full visibility of *all* extracted actions across the entire timeline.

---

## 🏗️ Architecture & Logic Changes

### 1. Tail-Folding for Chunk Windows (`utils/timeUtils.ts`)
- Added tail-folding logic to `computeChunkWindows`. 
- If the final chunk in a sequence is less than 50% of the target chunk size, it is now folded into the preceding chunk. This prevents wasting LLM calls on tiny 5-10 second tail segments.
- Added 3 comprehensive unit tests in `utils/timeUtils.test.ts` to verify strict `< 50%` folding behavior.

### 2. State Management & API (`server/jobManager.ts`, `server.ts`)
- **New State Variables:** Added `narrationChunkIndex`, `narrationChunkSize`, and `narrationChunkCount` to the `JobState` interface.
- **API Passthrough:** Updated the `/api/start-job` endpoint to accept `narrationChunkSize`.
- **Resume Validation:** Updated the `isResuming` check to ensure `narrationChunkSize` matches the existing job state to prevent layout misalignment on resume.

### 3. Loop 1: Phase A/B Extraction (0% - 50% Progress)
- Stripped Phase C logic out of the primary `for` loop.
- The loop now strictly handles Phase A (Raw Extraction) and Phase B (Validation & State Merge).
- Progress scaling for this loop was adjusted to map from `0%` to `50%`.
- Replaced the old atomic state commit with an A/B-only state commit that updates `chatHistory`, assigns `chunkIndex` to new actions/annotations, and commits UI state.

### 4. Loop 2: Phase C Narrative Synthesis (50% - 90% Progress)
- Introduced a secondary `for` loop that iterates over `narrationChunks` (wider windows, default 150s, with reduced overlap).
- **Full Action Visibility:** The LLM now receives `relevantActions` and `relevantAnnotations` filtered from the *entire* `cumulativeActions` array, buffered by 15 seconds on either side of the clip window to catch boundary actions.
- **Resumability:** Added robust resume logic (`resumingPhaseC`). If a job fails during Phase C, it will skip the A/B loop entirely, preserve existing narrative steps and `learnedContext`, and resume exactly at the failed `narrationChunkIndex`.
- **Retry Logic:** Maintained the 1x retry logic if Phase C returns 0 steps despite having relevant actions in its window.

### 5. UI & Visualizer Updates (`components/ChunkVisualizer.tsx`, `components/AnalysisView.tsx`)
- **Removed Dead State:** Removed the `analyzing_phase_c` pulse animation and labels from the individual A/B chunk tiles, as they no longer process Phase C.
- **New Indicator:** Added a dedicated narration progress row below the chunk tiles (e.g., *"Narrating segment 1 of 3..."*) with a pulsing indigo indicator.
- **Legend:** Added "Narration" to the visualizer legend.
- **State Threading:** Threaded `narrationChunkIndex`, `narrationChunkCount`, and `isNarrating` from `AnalysisView` down to `ChunkVisualizer`.

### 6. Specification Updates (`tutorial-dissector.allium.md`)
- **Updated Source of Truth:** The Allium specification has been updated to accurately reflect the new split-loop pipeline architecture.
- **New Entities & Enums:** Added `NarrationChunk` entity and `NarrationChunkStatus` enum to model the wider, non-aligned chunks used in Phase C.
- **State Management:** Added `narration_chunk_index`, `narration_chunk_size`, and `narration_chunk_count` to `ProcessingState` and `Project` entities.
- **Rule Transitions:** Updated `CompletePhaseB`, `CompletePhaseC`, and `GlobalDeduplication` rules, and added explicit `StartNarrativeSynthesis` and `StartGlobalDeduplication` rules to formally model the new pipeline transitions.

---

## 🧪 Testing & Verification Guide for Reviewer

### Automated Tests
1. Run `npx vitest run utils/timeUtils.test.ts`. Verify all 9 tests pass (specifically the 3 new tail-folding tests).
2. Run `npx tsc --noEmit` to verify no TypeScript interface regressions.

### Manual Verification Steps
1. **Chunk Layout:** Start a job with a ~3:45 video. Verify logs show the A/B chunks (e.g., 4x 60s chunks) and a separate Narration plan (e.g., 2x 150s chunks, with the tail folded).
2. **Sequential Execution:** Verify in the UI/logs that all A/B chunks complete (turning green) *before* "Starting narrative synthesis" begins.
3. **Progress Bar:** Verify the progress bar scales smoothly:
   - `0-50%`: Phase A/B
   - `50-90%`: Phase C
   - `92-100%`: Phase D (Global Dedup)
4. **UI Feedback:** Verify the A/B chunk tiles do *not* show "NARRATING...". Verify the new "Narrating segment X of Y..." text appears below the tiles during Phase C.
5. **Resume Behavior:** 
   - Cancel a job midway through Phase C.
   - Restart the job.
   - Verify the logs state: `"Resuming Phase C from narration chunk X/Y. Preserving Z existing steps."`
   - Verify Phase A/B is skipped and no duplicate narrative steps are generated.

---
*Note: This PR perfectly aligns with the `PLAN_CONFIRMATION.md` checklist.*
