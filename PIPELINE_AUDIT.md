# Critical Audit: Video Processing Pipeline

## 🎯 Executive Summary
Following the recent architectural split of the processing loops, the pipeline is significantly more robust. However, a deep dive into the end-to-end workflow reveals several logical gaps, scalability bottlenecks, and architectural vulnerabilities—particularly concerning state management in a serverless environment and context degradation over long videos.

This document outlines these findings, categorized by pipeline phase and system architecture, to serve as a roadmap for future hardening.

---

## 🔍 Phase-by-Phase Analysis

### Phase A & B: Extraction and Validation
**1. Context Window Degradation (Sliding Window)**
- **The Gap:** In `jobManager.ts`, the `chatHistory` for Phase B is strictly truncated to the last 60 items (30 turns). While this prevents token overflow, it creates a "goldfish memory" effect for long videos. If a user establishes a core UI convention at 01:00, Phase B at 15:00 will have completely forgotten it, potentially leading to hallucinated UI states or misclassified actions.
- **Improvement:** Implement a tiered context system: maintain a rolling window for recent actions, but summarize older chat history into a persistent "Global UI Rules" prompt that is passed to all subsequent chunks.

**2. Overlap Boundary Fragmentation**
- **The Gap:** The chunking overlap defaults to 30s but is user-configurable via slider (`InputPanel.tsx:86-95`, `AnalysisView.tsx:25`). The value is passed as a parameter to `computeChunkWindows()` (`timeUtils.ts:24-27`), not hardcoded in processing logic. However, the underlying concern remains valid: if a complex multi-step interaction spans exactly across a boundary and exceeds the configured overlap duration, Phase A will split it into two fragmented actions, and Phase B may fail to merge them properly. Note that narration chunks use only 40% of the primary overlap ratio (`jobManager.ts:281`), making this more acute for Phase C.
- **Improvement:** Consider smarter boundary detection, but note this is lower priority since overlap is already tunable by the user.

### Phase C: Narrative Synthesis
**1. Unbounded Growth of `learnedContext`**
- **The Gap:** `learned_insights` are accumulated as a flat string list (`jobManager.ts:554-562`). Over a 30-minute video, this string will grow continuously within a single job run (note: it resets to `""` on fresh Phase C starts per `jobManager.ts:468`). While there is case-insensitive exact-match deduplication (`!currentInsights.includes(insight.toLowerCase())`), semantic duplicates (e.g., "User clicks save" vs "The save button is clicked") will bypass this and bloat the prompt, eventually causing token limit errors or diluting the LLM's attention.
- **Improvement:** Use an LLM-driven summarization step every 5-10 chunks to compress `learnedContext` into a dense, non-redundant knowledge graph or bulleted list.

**2. Fixed Context Buffer**
- **The Gap:** The `CONTEXT_BUFFER_SEC = 15` is hardcoded. If a narrative step requires context from an action that occurred 20 seconds prior to the chunk boundary, it will be blind to it.
- **Improvement:** Instead of a fixed time buffer, pass the last `N` sequential actions regardless of their timestamp, ensuring logical continuity rather than arbitrary temporal continuity.

### Phase D: Global Deduplication
**1. Brittle ID Remapping Heuristic**
- **The Gap:** The actual deduplication in Phase D is LLM-driven via `analyzeGlobalDeduplication()` (`geminiService.ts:676`), not heuristic-based. The LLM decides which actions to keep/remove. However, after the LLM returns deduplicated actions, the *narrative link remapping* falls back to a brittle heuristic (`jobManager.ts:758-816`) based on timestamps (`<= 2s`), `action_type`, and a scoring system (element: +2, panel: +1, detail: +3). If the LLM slightly rephrases an action during dedup, the heuristic fails, resulting in broken links and orphaned narrative steps. The brittleness is specifically in post-dedup link remapping, not in the dedup decisions themselves.
- **Improvement:** Force the LLM in Phase D to explicitly output a mapping of `[Old_ID -> New_ID]` or `[Merged_IDs -> Kept_ID]` as part of its JSON schema, removing the need for fragile heuristics in the application code.

**2. Coarse Phase D Progress**
- **The Gap:** Phase D sets progress to 92% at start (`jobManager.ts:724`), then emits intermediate callbacks at 93% (`geminiService.ts:729`), 96% (`:742`), and 98% (`:764`) before reaching 100%. This is not a total freeze, but the updates are coarse — for long videos with hundreds of actions, the LLM call can take 30-60 seconds with only 4 progress increments, making the UI feel sluggish.
- **Improvement:** Stream the Phase D response or break global dedup into a hierarchical map-reduce pattern with more granular progress updates.

---

## 🏗️ Architecture & State Management

**1. In-Memory State (No Persistence)**
- **The Gap (Critical):** `jobs` and `cancelTokens` are stored in memory (`jobManager.ts:37-38`: `const jobs = new Map()` and `const cancelTokens = new Set()`). Any server restart will instantly wipe all active jobs. If the application is deployed to a horizontally-scaled environment (e.g., Cloud Run), different instances will have inconsistent job state. Users will see jobs hang indefinitely or return 404s. Note: No Cloud Run configuration was found in the repository, but the vulnerability applies to any multi-instance or restartable deployment.
- **Improvement:** Migrate job state to Firestore or Redis. The polling endpoint should read from the database, and worker processes should update it.

**2. Side-Effects on GET Requests**
- **The Gap:** In `server.ts`, the polling endpoint `GET /api/start-job/:jobId` mutates state: `if (state.logCapOccurred) state.logCapOccurred = false;`. This violates REST principles and breaks if the user opens the app in two tabs (one tab consumes the flag, the other misses it).
- **Improvement:** Use a cursor-based pagination system for logs (`?sinceLogId=XYZ`) where the server is stateless and the client tracks what it has seen.

**3. Security: API Key in Video URLs**
- **The Gap (Critical):** For Gemini files, the frontend constructs a playable URL by appending the API key as a query parameter: `alt=media&key=${currentApiKey}`. This exposes the raw API key in the browser's network tab, history, and potentially to third-party extensions.
- **Improvement:** Create a secure proxy endpoint on the Node server (e.g., `/api/video-stream/:fileId`) that attaches the API key server-side and streams the video chunks to the frontend.

---

## 🚀 Recommended Action Plan (Next Steps)
1. **Immediate:** Fix the API key exposure in video URLs (Security).
2. **Short-term:** Refactor Phase D ID remapping to rely on LLM schema outputs rather than heuristics (Reliability).
3. **Medium-term:** Migrate `jobManager.ts` in-memory maps to Firestore to support Cloud Run deployments (Scalability).
4. **Long-term:** Implement LLM-driven summarization for `chatHistory` and `learnedContext` (AI Performance).

---

## 📊 Cost/Benefit & ROI Matrix

To facilitate prioritization, the identified improvements have been evaluated using a research-grade ROI matrix. 

**Methodology:**
- **Effort (1-5):** Implementation difficulty (1 = Trivial, 5 = Major rewrite/R&D).
- **Risk (1-5):** Risk of regression or breaking existing logic (1 = Isolated, 5 = Core pipeline mutation).
- **Impact (1-5):** Quality, security, or stability improvement potential.
- **Certainty (1-5):** Confidence that the change will yield the expected result (1 = Experimental, 5 = Deterministic).
- **ROI Score:** Calculated as `(Impact × Certainty) / (Effort × Risk)`. Higher scores indicate the most efficient path forward.

| Proposed Improvement | Effort | Risk | Impact | Certainty | ROI Score | Classification |
| :--- | :---: | :---: | :---: | :---: | :---: | :--- |
| **1. Fixed Context Buffer (Phase C)**<br>*Switch from time-based to count-based action buffer.* | 1 | 1 | 3 | 5 | **15.00** | 🟢 **Easy Win** |
| **2. GET Request Side-Effects**<br>*Use cursor-based pagination for logs.* | 1 | 1 | 2 | 5 | **10.00** | 🟢 **Easy Win** |
| **3. API Key Proxy (Security)**<br>*Server-side video streaming proxy.* | 2 | 2 | 5 | 5 | **6.25** | 🟡 **High Priority** |
| **4. Unbounded `learnedContext`**<br>*Periodic LLM summarization of insights.* | 2 | 2 | 4 | 4 | **4.00** | 🟡 **Quick Win** |
| **5. Brittle ID Remapping (Phase D)**<br>*LLM-enforced ID mapping schema.* | 2 | 3 | 4 | 4 | **2.66** | 🟠 **Strategic** |
| **6. Coarse Phase D Progress**<br>*Stream Phase D response. (Note: 4 intermediate callbacks already exist at 93/96/98%.)* | 3 | 2 | 2 | 4 | **1.33** | 🟠 **Strategic** |
| **7. In-Memory State**<br>*Migrate to Firestore/Redis. (Applies to any restartable/multi-instance deployment.)* | 4 | 4 | 5 | 5 | **1.56** | 🔴 **Major Project** |
| **8. Context Window Degradation**<br>*Tiered context / Global UI Rules prompt.* | 3 | 3 | 4 | 3 | **1.33** | 🟣 **Experimental** |
| **9. Overlap Boundary Fragmentation**<br>*Smarter boundary detection. (Note: overlap is already user-configurable, default 30s.)* | 5 | 4 | 3 | 2 | **0.30** | 🟤 **Deferred R&D** |

### 🎯 Execution Strategy
1. **Phase 1 (The Easy Wins):** Immediately implement the Fixed Context Buffer and GET Request fixes. These take minutes and carry near-zero risk.
2. **Phase 2 (Critical Path):** Implement the API Key Proxy. Though slightly more effort, the security impact makes it non-negotiable.
3. **Phase 3 (Pipeline Hardening):** Address `learnedContext` bloat and Phase D ID remapping to stabilize the AI outputs.
4. **Phase 4 (Infrastructure):** Tackle the Serverless State Migration as a dedicated epic.
