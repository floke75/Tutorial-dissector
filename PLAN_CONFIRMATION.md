# Binding Confirmation: Split Processing Loops — Fix Forward-Visibility Gap

This document serves as a strict, binding checklist to ensure complete adherence to the planned refactor. Each step must be explicitly verified and checked off only after the exact changes described in the plan have been implemented and confirmed.

## Step 1: Tail-folding in `computeChunkWindows`
- [x] 1a. `utils/timeUtils.ts`: Insert tail-folding logic immediately before `return chunks;`.
- [x] 1b. `utils/timeUtils.test.ts`: Add 3 test cases for tail-folding in the `computeChunkWindows` describe block.

## Step 2: Add `narrationChunkSize` parameter & `narrationChunkIndex` state
- [x] 2a. `server/jobManager.ts`: Add `narrationChunkIndex`, `narrationChunkSize`, and `narrationChunkCount` to `JobState` interface.
- [x] 2b. `server/jobManager.ts`: Add `narrationChunkSize?: number;` to `processVideoJob` params.
- [x] 2c. `server/jobManager.ts`: Initialize fresh state with `narrationChunkIndex`, `narrationChunkSize`, and `narrationChunkCount`.
- [x] 2c-ii. `server/jobManager.ts`: Update `isResuming` validation to include `narrationChunkSize` check.
- [x] 2d. `server/jobManager.ts`: Add `narrationChunkSize?: number;` to `runJob` params.
- [x] 2e. `server/jobManager.ts`: Compute narration chunks between fresh state init and chat history init.
- [x] 2f. `server/jobManager.ts`: Add `formatMMSS` import.
- [x] 2g. `server.ts`: Pass `narrationChunkSize` through `/api/start-job` POST handler.
- [x] 2h. `components/AnalysisView.tsx`: Confirm `narrationChunkSize` is NOT sent from the client.

## Step 3: Convert first loop to Phase A/B only
- [x] 3a. `server/jobManager.ts`: Update progress scale in the first loop from 0–100% to 0–50%.
- [x] 3b. `server/jobManager.ts`: Delete Phase C from the loop body (from comment to `bumpVersion(state);`).
- [x] 3c. `server/jobManager.ts`: Insert A/B-only state commit in place of the deleted code.

## Step 4: Add Phase C loop after the A/B loop (with resume support)
- [x] 4. `server/jobManager.ts`: Insert the Phase C loop block between the A/B loop's closing `}` and the global dedup comment.

## Step 5: Verify progress alignment
- [x] 5. `server/jobManager.ts`: Confirm `state.progress = 92;` remains present after the Phase C loop.

## Step 6: Update ChunkVisualizer for Phase C feedback
- [x] 6a. `components/ChunkVisualizer.tsx`: Remove dead `analyzing_phase_c` rendering and labels.
- [x] 6b. `components/ChunkVisualizer.tsx`: Add narration progress indicator row.
- [x] 6c. `components/AnalysisView.tsx`: Thread `narrationChunkIndex`, `narrationChunkCount`, and `isNarrating` state to `ChunkVisualizer`.
- [x] 6d. `components/ChunkVisualizer.tsx`: Add "Narration" to the legend.

## Verification
- [x] Automated tests pass (`npx vitest run utils/timeUtils.test.ts`).
- [x] TypeScript compilation succeeds (`npx tsc --noEmit`).
