# JSON Optimization Pipeline: Plan vs. Implementation Comparison

This document compares the implementation plan for the JSON Optimization Pipeline (as detailed in the system instructions) with the actual codebase, noting all differences and providing a plan for reconciliation.

**UPDATE**: All issues listed below have been resolved in the latest PR. This document serves as a historical record of the bugs that were fixed.

## Differences Noted (RESOLVED)

### 1. `cleanFinalOutput` Execution Location (Server vs. Client)
- **Plan**: Steps 5a, 5b, and 5d specify that `cleanFinalOutput` should be executed on the server in `server/jobManager.ts` after Phase D completes. The result should be stored in `state.cleanedOutput` and sent to the frontend via the polling response.
- **Previous State**: `cleanFinalOutput` was executed on the client in `components/ResultsTimeline.tsx` using a `useMemo` hook. `cleanedOutput` was not added to the server's `JobState` or `ProcessingState`.
- **Impact**: The client had to compute the cleaned output on every relevant state change, which could be expensive for large videos. It also meant the server logs didn't reflect the actual size of the cleaned output as intended in Step 5b.
- **Resolution**: Moved `cleanFinalOutput` computation to the server in `server/jobManager.ts`, stored in `state.cleanedOutput`, and passed down to `ResultsTimeline` via `AnalysisView.tsx`.

### 2. Phase C `cleanForPrompt` Argument Bug
- **Plan**: Step 3c specifies `.replace('{annotations}', compactStringify(relevantAnnotations.map(cleanForPrompt)))`.
- **Previous State**: The code used `relevantAnnotations.map(cleanForPrompt)`. Because `Array.prototype.map` passes `(element, index, array)` to the callback, and `cleanForPrompt` takes `(action: any, options?: CleanOptions)`, the `index` (a number) was passed as the `options` argument.
- **Impact**: This was a bug. While it might not crash immediately if `options?.keepConfidence` evaluates to undefined for a number, it's unsafe and violates the expected type signature.
- **Resolution**: Wrapped `cleanForPrompt` in an arrow function: `relevantAnnotations.map(a => cleanForPrompt(a))`.

### 3. Phase C `state_change` Missing `type` Field
- **Plan**: Step 3a specifies that `state_change` items should include `type: c.type` alongside `label: c.label` to disambiguate identically-labeled components of different types.
- **Previous State**: The code in `services/geminiService.ts` omitted `type: c.type` and only included `label: c.label` (`const entry: Record<string, string> = { label: c.label };`).
- **Impact**: The model might struggle to disambiguate between components with the same label but different types (e.g., a "Submit" button vs. a "Submit" text field).
- **Resolution**: Added `type: c.type` to the `state_change` mapping in `services/geminiService.ts`.

### 4. `detectUnlinkedActions` Heuristic Simplification
- **Plan**: The spec states that `detectUnlinkedActions` "detects contiguous clusters of orphan actions co-occurring with empty narrative steps, which is the telltale sign of cross-chunk ID linking failure."
- **Previous State**: The implementation in `utils/jsonOptimize.ts` used a much simpler global heuristic: `const likely_linking_failure = emptyStepsCount > 0 && unlinkedIds.length > 3;`. It did not check for contiguous clusters or co-occurrence.
- **Impact**: The diagnostic warning might trigger falsely if there are empty steps and unlinked actions in completely different parts of the video, reducing the reliability of the warning.
- **Resolution**: Upgraded the heuristic to a proper contiguous-cluster + temporal co-occurrence algorithm in `utils/jsonOptimize.ts`.

---

## Plan for Reconciliation (COMPLETED)

### 1. Move `cleanFinalOutput` to the Server
- [x] Update `server/jobManager.ts` to call `cleanFinalOutput` after Phase D completes (as specified in Step 5b).
- [x] Add `cleanedOutput?: object;` to `JobState` in `server/jobManager.ts` and `ProcessingState` in `types.ts`.
- [x] Update `components/AnalysisView.tsx` to read `cleanedOutput` from the polling response and pass it to `ResultsTimeline`.
- [x] Remove the `useMemo` computation of `cachedCleanedOutput` from `components/ResultsTimeline.tsx` and use the prop directly.

### 2. Fix `cleanForPrompt` Usage in Phase C
- [x] In `services/geminiService.ts` (around line 556), change `.replace('{annotations}', compactStringify(relevantAnnotations.map(cleanForPrompt)))` to `.replace('{annotations}', compactStringify(relevantAnnotations.map(a => cleanForPrompt(a))))`.

### 3. Add `type` to Phase C `state_change`
- [x] In `services/geminiService.ts` (around line 529), update the `state_change` mapping to include `type: c.type`:
  ```typescript
  const entry: Record<string, string | number | boolean> = { type: c.type, label: c.label };
  ```

### 4. Enhance `detectUnlinkedActions` Heuristic
- [x] Update `detectUnlinkedActions` in `utils/jsonOptimize.ts` to actually look for contiguous clusters of orphan actions that co-occur temporally with empty narrative steps, rather than just relying on global counts. This will make the diagnostic warning much more accurate.
