# Refined Plan: Pipeline Robustness & Frontend-Backend Reliability

> **Status:** Ready for implementation
> **Scope:** `server/jobManager.ts`, `server.ts`, `components/AnalysisView.tsx`, `services/geminiService.ts`

---

## Context

The Tutorial Dissector pipeline processes videos over 5–30+ minutes, with multiple Gemini API calls per chunk. The frontend polls every 2 seconds. Several gaps cause the system to appear "stuck" or lose work:

- Backend completes but frontend never reflects it (stuck in `running_*` state after server restart)
- Server restarts erase all in-memory job state; poll returns 404 and frontend gives up after 15 retries
- Every poll returns the **entire** job state (all actions, annotations, steps, logs) — hundreds of KB
- Every poll triggers a full IndexedDB write (no debounce)
- No way to distinguish hung job from slow processing
- Chunk status stuck on phase-specific value when job errors
- Partial results lost when later phase fails

---

## Bug Inventory (unchanged)

| # | Severity | Summary |
|---|---|---|
| B1 | Critical | Frontend stuck in `running_*` after server restart — no recovery |
| B2 | Critical | Server restart erases in-memory job state — 404 kills frontend |
| B3 | High | Full job state sent on every 2s poll |
| B4 | High | IndexedDB save fires on every poll tick |
| B5 | High | Chunk status stuck on `analyzing_phase_a/b/c` when job errors |
| B6 | High | Progress stalls at 95% during Phase D |
| B7 | Medium | Log array grows unbounded |
| B8 | Medium | `withTimeout` doesn't cancel underlying Gemini call |
| B9 | Medium | Poll 404 after restart treated as generic error |
| B10 | Medium | No heartbeat — can't distinguish slow vs hung |
| B11 | Low | `learnedContext` accumulates duplicate insights |
| B12 | Low | IndexedDB save race condition (deferred — `idb-keyval` can't help) |
| B13 | Low | Phase C empty response silently skips chunk narration |
| B14 | Low | Cancel stops polling before server acknowledges |

---

## Step 1 — Add `lastUpdatedAt` heartbeat + `stateVersion` to job state (B10, enables B1/B3/B6)

**Files:** `server/jobManager.ts` (interface + `runJob`)

### Changes

1. Add to `JobState` interface (line ~7):
```typescript
lastUpdatedAt: number;
stateVersion: number;
```

2. Initialize when creating job state:
```typescript
lastUpdatedAt: Date.now(),
stateVersion: 0,
```

3. Add a `bumpVersion` helper inside `runJob` (alongside `addLog`):
```typescript
const bumpVersion = () => {
  const s = jobs.get(jobId);
  if (s) {
    s.stateVersion = (s.stateVersion || 0) + 1;
    s.lastUpdatedAt = Date.now();
  }
};
```

4. Call `bumpVersion()` at each meaningful state transition:
   - After each chunk completion (line ~397, after `chunk.status = 'completed'`)
   - Phase transitions (`state.status = 'running_narrative'`, `'running_dedup'`)
   - Terminal states (completed/error/cancelled)

> **Correction from original plan:** Do NOT increment `stateVersion` inside `addLog`. Logs are high-frequency; the version counter is for structural changes only. Also, `addLog` uses full `uuidv4()` (not `.substring(0, 8)` as the original plan showed).

---

## Step 2 — Frontend stale job detection and recovery (B1, B9)

**File:** `components/AnalysisView.tsx`

### Changes

1. **On load** (in the `loadData` useEffect, lines 94-162): After loading from IndexedDB, if `procState.status` is a running state, check the server:

```typescript
// After setting all state from IndexedDB...
if (data.procState.status === 'running_visual' ||
    data.procState.status === 'running_narrative' ||
    data.procState.status === 'running_dedup') {
  try {
    const res = await fetch(`/api/process/${projectId}?t=${Date.now()}`, { cache: 'no-store' });
    if (res.ok) {
      const serverState = await res.json();
      if (serverState.status === 'completed' || serverState.status === 'error' || serverState.status === 'cancelled') {
        // Server finished while we were away — apply final state
        // Use the same field mapping as the existing poll function (lines 385-413)
        data.procState.status = serverState.status;
        if (serverState.actions) data.actions = serverState.actions;
        if (serverState.annotations) data.annotations = serverState.annotations;
        if (serverState.narrativeSteps) data.narrativeSteps = serverState.narrativeSteps;
        if (serverState.chunks) data.chunks = serverState.chunks;
        if (serverState.uiState) data.latestUIState = serverState.uiState;  // Note: server field is "uiState"
      }
      // else: still running — the existing polling useEffect will pick it up
    } else if (res.status === 404) {
      // Server lost this job (restart/TTL expiry)
      data.procState.status = (data.actions?.length > 0) ? 'completed' : 'error';
      if (!data.actions?.length) {
        data.procState.error = 'Server connection lost. Partial results may be available.';
      }
    }
  } catch (e) {
    data.procState.status = 'error';
    data.procState.error = 'Could not reach server. Data loaded from local storage.';
  }
}
```

> **Correction from original plan:** Server returns `uiState`, not `latestUIState`. Must map field names correctly. Also, don't try to construct a `Project` from server response — just patch the loaded `data` object using the same field mapping the poll function already uses.

2. **Poll 404 handling** (in the poll catch, line ~376): Add specific 404 detection before the generic error path:

```typescript
if (!pollRes.ok) {
  if (pollRes.status === 404) {
    // Job gone from server — check if we have usable results
    if (actionsRef.current.length > 0 || stateRef.current.status === 'running_dedup') {
      handleLog('warn', 'Server lost job state (possible restart). Using last known results.');
      setProcState(prev => ({ ...prev, status: 'completed' }));
    } else {
      handleLog('error', 'Server lost job state. No results available.');
      setProcState(prev => ({ ...prev, status: 'error' }));
    }
    if (pollingRef.current) clearTimeout(pollingRef.current);
    return;
  }
  throw new Error(`HTTP error! status: ${pollRes.status}`);
}
```

> **Correction from original plan:** Must use `actionsRef.current` (not `actions`) since the poll function is a closure and needs the ref for fresh values. The existing code already uses `stateRef`, `chunksRef`, `actionsRef` (lines 64-70).

---

## Step 3 — Incremental poll responses (B3)

**Files:** `server.ts` (GET endpoint), `server/jobManager.ts` (stateVersion from Step 1)

### Changes

1. Modify GET endpoint (server.ts, line ~89) to accept `since` query param:

```typescript
app.get("/api/process/:jobId", (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  const state = getJobState(req.params.jobId);
  if (!state) return res.status(404).json({ error: "Job not found" });

  const { chatHistory, ttlTimerId, ...safeState } = state;
  const sinceVersion = parseInt(req.query.since as string) || 0;

  if (sinceVersion > 0 && sinceVersion === state.stateVersion) {
    // Nothing changed — return minimal response
    return res.json({
      status: state.status,
      progress: state.progress,
      stateVersion: state.stateVersion,
      lastUpdatedAt: state.lastUpdatedAt,
      unchanged: true
    });
  }

  res.json({ ...safeState, unchanged: false });
});
```

2. Update frontend poll to track version and skip heavy updates when unchanged:

```typescript
// Outside the poll closure (in the useEffect):
let lastVersion = 0;

// Inside poll(), after parsing response:
if (state.unchanged) {
  setProcState(prev => ({ ...prev, status: state.status, progress: state.progress }));
  // Skip setActions, setChunks, setNarrativeSteps, etc.
} else {
  lastVersion = state.stateVersion || 0;
  // ... existing full state update logic (lines 385-434) ...
}
```

---

## Step 4 — Debounce IndexedDB saves (B4)

**File:** `components/AnalysisView.tsx` (lines 164-186)

### Changes

Replace the save `useEffect` with a debounced version. During active processing, debounce to 5 seconds. When processing stops (completion, error, settings change), save immediately.

```typescript
const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

useEffect(() => {
  if (!isLoaded) return;

  const isActive = procState.status === 'running_visual' ||
                   procState.status === 'running_narrative' ||
                   procState.status === 'running_dedup';

  const doSave = () => {
    const saveData: Project = {
      id: projectId, name: projectName, updatedAt: Date.now(),
      videoUrl, durationInput, chunkSize, overlap, customContext,
      chunks, actions, annotations, narrativeSteps, procState, latestUIState,
      status: procState.status, actionCount: actions.length
    };
    saveProject(saveData);
  };

  if (isActive) {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(doSave, 5000);
  } else {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    doSave();
  }

  return () => { if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current); };
}, [projectName, videoUrl, durationInput, chunkSize, overlap, customContext, chunks, actions, annotations, narrativeSteps, procState, latestUIState, projectId, isLoaded]);
```

> Same dependency array as the existing effect (line 186). No change needed there.

---

## Step 5 — Set chunk status to `'error'` on failure (B5)

**File:** `server/jobManager.ts` — outer catch block (lines 547-551)

> **Correction from original plan:** `chunk.errorMsg` and `ChunkStatus = 'error'` already exist in the type system (`types.ts` lines 48, 117). No type changes needed.

### Changes

Add to the outer catch block:

```typescript
} catch (error: any) {
  console.error(`Job ${jobId} failed:`, error);
  state.status = 'error';
  state.error = error.message || 'Unknown error occurred';
  addLog('error', `Fatal error: ${state.error}`);

  // Mark the current chunk as errored
  const currentChunk = state.chunks[state.currentChunkIndex];
  if (currentChunk && currentChunk.status !== 'completed') {
    currentChunk.status = 'error';
    currentChunk.errorMsg = state.error;
  }
} finally {
```

The `ChunkVisualizer` already renders `'error'` status as red "FAILED" (confirmed in `ChunkVisualizer.tsx`).

---

## Step 6 — Progress updates during Phase D (B6)

**File:** `server/jobManager.ts` (Phase D block, lines 461-474), `services/geminiService.ts`

> **Correction from original plan:** `analyzeGlobalDeduplication` takes 6 params: `(actions, cumulativeNarrative, finalUiState, customContext, apiKey, onLog?)`. It does NOT have an `onProgress` param. We need to add one.

### Changes

1. Add `onProgress` as optional 7th parameter to `analyzeGlobalDeduplication`:
```typescript
export async function analyzeGlobalDeduplication(
  actions: ActionItem[],
  cumulativeNarrative: NarrativeStep[],
  finalUiState: any,
  customContext: string,
  apiKey: string,
  onLog?: (level: LogLevel, msg: string, data?: any) => void,
  onProgress?: (pct: number) => void   // NEW
): Promise<ActionItem[]>
```

2. Call `onProgress` before each retry attempt inside the function.

3. Update call site in `jobManager.ts` (line 467):
```typescript
const deduplicatedActionsRaw = await analyzeGlobalDeduplication(
  cumulativeActions,
  cumulativeNarrative,
  latestUIState,
  customContext,
  apiKey,
  addLog,
  (pct) => { state.progress = pct; bumpVersion(); }  // 7th arg
);
```

4. Update progress before Phase D:
```typescript
state.progress = 92;  // was 95
```

---

## Step 7 — Cap server-side log array (B7)

**File:** `server/jobManager.ts` — `addLog` helper (lines 160-165)

### Changes

```typescript
const MAX_LOGS = 200;
const addLog = (level: LogLevel, message: string, data?: any) => {
  const state = jobs.get(jobId);
  if (state) {
    state.logs.push({ id: uuidv4(), timestamp: Date.now(), level, message, data });
    if (state.logs.length > MAX_LOGS) {
      state.logs = state.logs.slice(-MAX_LOGS);
    }
  }
};
```

> **Correction from original plan:** Uses `uuidv4()` (not `.substring(0, 8)`). Does NOT bump `stateVersion` here — that's handled by `bumpVersion()` at structural transition points only.

---

## Step 8 — Improve `withTimeout` zombie logging (B8)

**File:** `services/geminiService.ts` (lines 12-26)

### Changes

Add a `timedOut` flag to detect and log when a zombie response arrives:

```typescript
function withTimeout<T>(promise: Promise<T>, ms: number, operationName: string): Promise<T> {
  let timeoutId: NodeJS.Timeout;
  let timedOut = false;

  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => {
      timedOut = true;
      reject(new Error(`Operation '${operationName}' timed out after ${ms / 1000}s`));
    }, ms);
  });

  return Promise.race([
    promise.then(result => {
      if (timedOut) {
        console.warn(`[withTimeout] ${operationName}: API responded after timeout — result discarded.`);
      }
      return result;
    }),
    timeoutPromise
  ]).finally(() => {
    clearTimeout(timeoutId);
  });
}
```

> **Acknowledged limitation:** The Gemini SDK (`@google/genai`) does not support `AbortController`-based cancellation. This change is informational — it logs zombie completions but cannot prevent them. The real protection is the cancel token check after each phase.

---

## Step 9 — Improve cancel flow (B14)

**File:** `components/AnalysisView.tsx` — `handleCancelAndSave` (lines 523-542)

### Changes

Don't stop polling immediately. Let the poll loop detect `status === 'cancelled'` naturally:

```typescript
const handleCancelAndSave = async () => {
  if (!projectId) return;
  try {
    handleLog('warn', 'Sending cancel request to server...');
    await fetch(`/api/process/${projectId}/cancel`, { method: 'POST' });
    handleLog('info', 'Cancel request sent. Waiting for server to finish current operation...');
    // Don't clear polling — let it detect 'cancelled' status on next tick
  } catch (e) {
    console.error("Failed to cancel job:", e);
    handleLog('error', 'Failed to send cancel request. Stopping locally.');
    if (pollingRef.current) clearTimeout(pollingRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
    activePollingJobRef.current = null;
    setProcState(prev => ({ ...prev, status: 'cancelled' }));
  }
};
```

The terminal state check (lines 436-444) already handles `'cancelled'`.

---

## Step 10 — Deduplicate `learnedContext` insights (B11)

**File:** `server/jobManager.ts` (lines 364-366)

### Changes

Replace:
```typescript
if (learned_insights) {
  state.learnedContext = (state.learnedContext ? state.learnedContext + "\n- " : "- ") + learned_insights;
}
```
With:
```typescript
if (learned_insights) {
  const newInsight = learned_insights.trim();
  const existing = (state.learnedContext || '').toLowerCase();
  if (newInsight && !existing.includes(newInsight.toLowerCase())) {
    state.learnedContext = (state.learnedContext ? state.learnedContext + "\n- " : "- ") + newInsight;
  }
}
```

---

## Step 11 — Retry Phase C on empty response (B13)

**File:** `server/jobManager.ts` — after Phase C call (line ~362)

> **Correction from original plan:** The destructuring at line 352 is `const`. Must change to `let`. The retry call must use the correct 9-param signature: `(videoUrl, startSec, endSec, relevantVisualActions, relevantAnnotations, customContext, apiKey, previousSteps, onLog)`. In `runJob`, the 6th arg is the local variable `dynamicContext` (which maps to the `customContext` parameter positionally).

### Changes

Replace line 352-362:
```typescript
// Was: const { steps: newNarrativeStepsRaw, learned_insights } = await analyzeNarrationSegment(...);
let narrationResult = await analyzeNarrationSegment(
  videoUrl, chunk.clipStart, chunk.clipEnd,
  relevantActions, relevantAnnotations,
  dynamicContext, apiKey,
  cumulativeNarrative.slice(-10), addLog
);

// Retry once if Phase C returned 0 steps for a chunk with actions
if (narrationResult.steps.length === 0 && relevantActions.length > 0) {
  addLog('warn', `Phase C returned 0 steps for chunk ${i + 1} (${relevantActions.length} actions). Retrying...`);
  narrationResult = await analyzeNarrationSegment(
    videoUrl, chunk.clipStart, chunk.clipEnd,
    relevantActions, relevantAnnotations,
    dynamicContext, apiKey,
    cumulativeNarrative.slice(-10), addLog
  );
  if (narrationResult.steps.length > 0) {
    addLog('success', `Phase C retry yielded ${narrationResult.steps.length} steps.`);
  } else {
    addLog('warn', `Phase C retry also returned 0 steps. Chunk ${i + 1} actions will be unlinked.`);
  }
}

const newNarrativeStepsRaw = narrationResult.steps;
const learned_insights = narrationResult.learned_insights;
```

This avoids the `const` destructuring issue entirely by using a mutable `narrationResult` variable, then extracting the final values for downstream code compatibility.

---

## Step 12 — Save-on-unload safety net (data loss on tab close)

**File:** `components/AnalysisView.tsx`

### Changes

Add `beforeunload` handler that writes to `localStorage` (synchronous, guaranteed to complete):

```typescript
useEffect(() => {
  const handleBeforeUnload = () => {
    if (!isLoaded) return;
    const isActive = procState.status === 'running_visual' ||
                     procState.status === 'running_narrative' ||
                     procState.status === 'running_dedup';
    if (!isActive) return; // Only emergency-save during active processing

    try {
      const saveData: Project = {
        id: projectId, name: projectName, updatedAt: Date.now(),
        videoUrl, durationInput, chunkSize, overlap, customContext,
        chunks, actions, annotations, narrativeSteps, procState, latestUIState,
        status: procState.status, actionCount: actions.length
      };
      localStorage.setItem(`td_emergency_save_${projectId}`, JSON.stringify(saveData));
    } catch (e) { /* localStorage might be full */ }
  };

  window.addEventListener('beforeunload', handleBeforeUnload);
  return () => window.removeEventListener('beforeunload', handleBeforeUnload);
}, [projectId, projectName, videoUrl, durationInput, chunkSize, overlap, customContext, chunks, actions, annotations, narrativeSteps, procState, latestUIState, isLoaded]);
```

On load (in the `loadData` function, before line 97):
```typescript
const emergencyKey = `td_emergency_save_${projectId}`;
const emergencySave = localStorage.getItem(emergencyKey);
if (emergencySave) {
  try {
    const emergencyData = JSON.parse(emergencySave);
    if (!data || emergencyData.updatedAt > (data.updatedAt || 0)) {
      data = emergencyData;
    }
  } catch (e) { /* ignore corrupt data */ }
  localStorage.removeItem(emergencyKey);
}
```

---

## Files Modified

| File | Steps |
|---|---|
| `server/jobManager.ts` | 1, 5, 6, 7, 10, 11 |
| `server.ts` | 3 |
| `components/AnalysisView.tsx` | 2, 3, 4, 9, 12 |
| `services/geminiService.ts` | 6, 8 |

---

## Execution Order

1. **Step 1** (heartbeat + stateVersion) — prerequisite for 2, 3, 6
2. **Step 5** (chunk error status) — independent, quick win
3. **Step 7** (log cap) — independent, quick win
4. **Step 10** (dedup insights) — independent, quick win
5. **Step 3** (incremental polls) — depends on Step 1
6. **Step 4** (debounced save) — benefits from Step 3
7. **Step 2** (stale job recovery) — depends on Step 1
8. **Step 6** (Phase D progress) — depends on Step 1
9. **Step 8** (timeout zombie logging) — independent
10. **Step 9** (cancel flow) — independent
11. **Step 11** (Phase C retry) — independent
12. **Step 12** (unload save) — independent

---

## Key Corrections from Original Plan

| Issue | Original Plan Said | Actual Code |
|---|---|---|
| `addLog` log ID | `uuidv4().substring(0, 8)` | `uuidv4()` (full UUID) |
| `chunk.errorMsg` field | "Add to Chunk interface" | Already exists (`types.ts:117`) |
| `ChunkStatus` `'error'` | Implied it needed adding | Already exists (`types.ts:48`) |
| `analyzeGlobalDeduplication` params | 7 params (with onProgress) | 6 params — `onProgress` must be **added** |
| Server field name for UI state | `latestUIState` | `uiState` (server-side name) |
| `stateVersion` increment location | Inside `addLog` | Separate `bumpVersion()` at structural transitions only |
| Phase C destructuring | Change `const` to `let` on destructuring | Use intermediate `narrationResult` variable instead |
| `ProcessingStatus` type | Lists 7 values | Has 8 values (includes `'paused'`) |

---

## Verification

- **B1/B2/B9:** Start job → kill server → restart → open frontend. UI should show last-polled data or 'completed'/'error'.
- **B3:** Monitor Network tab during run. Between chunk completions, responses should be <200 bytes.
- **B4:** Monitor IndexedDB writes — at most once per 5 seconds during processing.
- **B5:** Trigger failure (bad API key). ChunkVisualizer should show red "FAILED", not blue "SCANNING...".
- **B6:** During Phase D, progress should move through 92→93→95→97→100.
- **B7:** After long video, `state.logs.length <= 200`.
- **B14:** Cancel mid-chunk. Frontend should continue polling until server confirms cancellation.

---

## Notes for Implementation

- Do NOT modify Gemini API call patterns (model, maxOutputTokens, responseSchema).
- Do NOT add WebSocket support.
- `stateVersion` increments are safe without locks (Node.js single-threaded).
- Emergency save (Step 12) uses `localStorage` intentionally — it's synchronous, guaranteed to complete before `beforeunload` finishes. IndexedDB is async and may be cancelled during unload.
- The `bumpVersion` approach keeps version semantically meaningful (structural changes only), avoiding excessive version churn from log appends.
