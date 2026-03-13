# Validation: Critical Audit of Video Processing Pipeline

## Overview
This document validates the claims in `PIPELINE_AUDIT.md` against the actual codebase. Each claim was traced to specific source lines and verified.

---

## Claim-by-Claim Validation

### Confirmed Claims (7/11)

| # | Claim | Evidence |
|---|-------|----------|
| 1 | Chat history truncated to 60 items (30 turns) | `jobManager.ts:372-378` — `if (nextChatHistory.length > 60) nextChatHistory = nextChatHistory.slice(-60)` |
| 2 | `learned_insights` stored as flat string with exact-match dedup | `jobManager.ts:554-561` — splits by `'\n- '`, checks `!currentInsights.includes(insight.toLowerCase())` |
| 3 | `CONTEXT_BUFFER_SEC = 15` is hardcoded | `jobManager.ts:495` — `const CONTEXT_BUFFER_SEC = 15` |
| 4 | Phase D ID remapping uses timestamp <=2s + action_type + scoring | `jobManager.ts:773-787` — exact criteria as described: element(+2), panel(+1), detail(+3) |
| 5 | In-memory state (`Map`/`Set`) for jobs and cancel tokens | `jobManager.ts:37-38` — `const jobs = new Map<string, JobState>()` and `const cancelTokens = new Set<string>()` |
| 6 | GET request mutates `logCapOccurred` | `server.ts:102-109, 125-126` — `state.logCapOccurred = false` on GET. Code already contains a self-documenting comment about this architectural violation. |
| 7 | API key exposed in video URLs | `AnalysisView.tsx:739` — `` `${url}${separator}alt=media&key=${currentApiKey}` `` |

### Partially Incorrect Claims (2/11)

| # | Claim | Actual Finding |
|---|-------|----------------|
| 8 | "Hardcoded 30s overlap" | The overlap is **user-configurable** via a slider in `InputPanel.tsx:86-95`. The default is 30s (`AnalysisView.tsx:25: useState(30)`), but `computeChunkWindows()` in `timeUtils.ts:24-27` accepts it as a parameter. The audit implies it is a static constant — it is not. |
| 9 | "Progress jumps from 92% to 100%" (UX freeze) | Phase D does set 92% at start (`jobManager.ts:724`), but `analyzeGlobalDeduplication` emits intermediate progress callbacks at **93%** (`geminiService.ts:729`), **96%** (`:742`), and **98%** (`:764`). The freeze is less severe than described. Still coarse for long videos though. |

### Unverifiable Claims (2/11)

| # | Claim | Notes |
|---|-------|-------|
| 10 | Cloud Run deployment | No `.run.app` URL, Dockerfile, or Cloud Run config found in the repo. The in-memory state vulnerability is real regardless of deployment target. |
| 11 | Phase D takes "30-60 seconds" | Duration depends on video length and action count. Not verifiable from code alone. |

---

## Nuances the Audit Missed

1. **Phase D dedup is LLM-driven, not heuristic-driven**: The actual deduplication is performed by the Gemini LLM via `analyzeGlobalDeduplication()` (`geminiService.ts:676`). The timestamp/scoring heuristic (`jobManager.ts:758-816`) is only a post-dedup fallback for remapping narrative links to removed duplicates. The brittleness is in link remapping, not in the dedup decision itself.

2. **`learnedContext` resets on fresh Phase C**: `jobManager.ts:468` resets `state.learnedContext = ""` when starting a new (non-resumed) Phase C run. The unbounded growth concern applies within a single job run only, not across jobs.

3. **Narration overlap is reduced**: Narration chunks use only 40% of the primary overlap ratio (`jobManager.ts:281: overlapRatio * 0.4`), making the overlap concern more relevant for narration than for extraction.

4. **The GET side-effect is already self-documented**: The code at `server.ts:102-109` contains a comment acknowledging the pattern as architecturally problematic for multi-client scenarios.

---

## Corrected ROI Assessment

The audit's ROI matrix is mostly sound, with two corrections:

| Item | Audit ROI | Corrected Assessment |
|------|-----------|---------------------|
| Hardcoded Overlap (#9 in audit) | ROI 0.60 (Deferred R&D) | Even lower priority — overlap is already configurable. Scene detection is pure R&D with no immediate need. |
| UX Freeze (#6 in audit) | ROI 2.00 (Strategic) | Slightly lower priority — intermediate progress callbacks already exist (93/96/98%). Could benefit from streaming, but not a total freeze. |

---

## Validated Implementation Order

1. **Phase 1 — Easy Wins**: Fixed Context Buffer (`jobManager.ts:495`) + GET side-effects (`server.ts:102-126`)
2. **Phase 2 — Security**: API key proxy to replace `AnalysisView.tsx:739`
3. **Phase 3 — Pipeline Hardening**: `learnedContext` summarization (`jobManager.ts:549-567`) + Phase D LLM-driven ID mapping (`geminiService.ts:676+`)
4. **Phase 4 — Infrastructure**: Persistent store migration (if serverless deployment confirmed)
5. **Deprioritize**: Overlap scene detection (overlap is already configurable)
