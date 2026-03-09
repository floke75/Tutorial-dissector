# Gemini 3 Optimization Implementation Plan

**Objective:** Implement Gemini 3 specific optimizations to improve UI analysis quality, reasoning retention, and prompt adherence.

**Execution Rules:**
1. **Strict Isolation:** Each step MUST be implemented in a separate, isolated pass. Do not combine multiple steps into a single code edit.
2. **Mandatory Updates:** After completing a step, this document MUST be updated to change the status to "Completed" and fill in the "Completion Details" before moving to the next step.

---

## Step 1: Media Resolution Upgrade
**Description:** Gemini 3 defaults to aggressive video compression (70 tokens/frame). For our text-heavy UI analysis, we need high resolution (280 tokens/frame). We will update the Gemini client initialization to use the `v1alpha` API and inject `mediaResolution: { level: "media_resolution_high" }` into the video parts for Phase A and the Narration Phase.
**Target Files:** `services/geminiService.ts`
**Status:** ✅ Completed
**Completion Details:** 
- Updated `getClient` to include `apiVersion: 'v1alpha'` in `httpOptions`.
- Added `mediaResolution: { level: "media_resolution_high" }` to the `fileData` part in `analyzeChunkPhaseA` and `analyzeNarrationSegment`.

---

## Step 2: System Instructions Migration
**Description:** Currently, Phase A and the Narration Phase prepend massive system prompts (`PHASE_A_SYSTEM_PROMPT`, `PASS_2_SYSTEM_PROMPT`) directly into the `user` message's `text` part. We will move these to the dedicated `systemInstruction` field in the `config` object to improve schema adherence and reduce terminal errors (Phase B already does this correctly).
**Target Files:** `services/geminiService.ts`
**Status:** ✅ Completed
**Completion Details:** 
- Extracted `basePrompt` and `prompt` from the user message `text` part in Phase A and Narration Phase respectively.
- Assigned these prompts (along with `customContext`) to a new `systemInstruction` variable.
- Added `systemInstruction: systemInstruction` to the `config` object in both `generateContent` calls.

---

## Step 3: Thought Signatures Preservation
**Description:** Gemini 3 uses encrypted `thoughtSignature`s to maintain reasoning context across multi-turn API calls. In `accumulateChunkPhaseB`, we manually construct the `chatHistory` array and currently drop these signatures. We will update the history management to extract and preserve `thoughtSignature` from the model's responses and include them in subsequent requests.
**Target Files:** `services/geminiService.ts`
**Status:** ✅ Completed
**Completion Details:** 
- Updated `newHistory` construction in `accumulateChunkPhaseB` to use the raw `response.candidates?.[0]?.content?.parts` array instead of just `{ text: text }`. This ensures any `thoughtSignature` fields returned by the model are preserved in the chat history for the next turn.
- Added logging to track when thought signatures are successfully preserved.

---

## Step 4: Code Execution Tool Integration (Visual Investigation)
**Description:** Gemini 3 Flash/Pro can use Python code execution to actively investigate images (zooming, cropping, calculating spatial bounding boxes). We will add the `codeExecution` tool to the `config.tools` array in Phase A and the Narration Phase to allow the model to perform high-precision spatial analysis of the UI.
**Target Files:** `services/geminiService.ts`
**Status:** ✅ Completed
**Completion Details:** 
- Enabled `tools: [{ codeExecution: {} }]` in `analyzeChunkPhaseA` (Phase A) to allow the model to use Python for bounding box normalization and spatial math.
- Enabled `tools: [{ codeExecution: {} }]` in `accumulateChunkPhaseB` (Phase B) to allow the model to deterministically calculate cumulative action counts and manage array deduplication.
- Enabled `tools: [{ codeExecution: {} }]` in `analyzeGlobalDeduplication` (Final Refinement) to allow the model to use algorithmic filtering for deduplication.
- Intentionally omitted from `analyzeNarrationSegment` (Narration Phase) to prevent regressions in story/narrative generation, per Gemini API documentation warnings.
