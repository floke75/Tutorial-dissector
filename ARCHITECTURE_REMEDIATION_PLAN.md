# Architecture Analysis & Remediation Plan

## Executive Summary
The Python post-processing script (`postprocess.py`) successfully patches the JSON output, but it acts as a band-aid for deep architectural flaws in the React application. Furthermore, the output schema requested for the Python script is fundamentally incompatible with the React application's TypeScript data model (`types.ts`). 

This document outlines a holistic, spec-driven, and LLM-optimized implementation plan to fix the root causes in the React application's processing pipeline, schemas, and prompts.

---

## Root Cause Analysis

1. **Context Isolation in Pass 2 (Overlapping Steps):** 
   Phase A and Phase B correctly pass `chatHistory` forward. However, Pass 2 (Narration) is executed in complete isolation per chunk. `analyzeNarrationSegment` lacks knowledge of the narrative steps generated in the previous chunk, guaranteeing overlapping steps and ID resets.
2. **Prompt Pollution (Chunk Boundaries):** 
   `PHASE_B_SYSTEM_PROMPT` explicitly instructs the LLM to insert `chunk_boundary` events. This pollutes the visual action data model with processing metadata.
3. **Critical Type Safety Discrepancies:** 
   The Python script's output mutates schemas (e.g., `timestamp` to `time_range`, `InsightType` mismatches, missing fields). If this JSON is loaded back into the app, it will fail type-checking.
4. **Gemini 3.1 Pro Capabilities Missed:** 
   The JSON schemas in `services/geminiService.ts` use `Type.STRING` for fields that are strictly defined as enums in `types.ts`. Gemini 3.1 Pro fully supports the `enum` property in `responseSchema`. Failing to use it causes the LLM to hallucinate freeform labels.

---

## Step-by-Step Implementation Plan

This plan is optimized for an LLM agent to execute sequentially. Each step includes the target file, the specific specification, and the verification criteria.

### Phase 1: Schema Strictness & Type Alignment
**Goal:** Leverage Gemini 3.1 Pro's `enum` support to guarantee output matches `types.ts` exactly, eliminating hallucinations.

*   **Step 1.1: Update `services/geminiService.ts` Schemas**
    *   **Target:** `actionItemSchema`, `narrativeStepSchema`
    *   **Spec:** 
        *   Import `ActionType`, `ActorType`, `InsightType`, `ActionConfidence` from `../types.ts` (if available as arrays/enums, or hardcode the literal arrays based on `types.ts`).
        *   Modify `action_type`: `{ type: Type.STRING, enum: ["click", "type", "scroll", "swipe", "navigate", "wait", "other"] }`
        *   Modify `actor`: `{ type: Type.STRING, enum: ["user", "system"] }`
        *   Modify `confidence`: `{ type: Type.STRING, enum: ["high", "medium", "low"] }`
        *   Modify `insight_type`: `{ type: Type.STRING, enum: ["explanation", "rationale", "tip", "warning", "workflow_framing", "comparison"] }`
    *   **Test:** Run `lint_applet` to ensure no TypeScript errors.
    *   **Implementation:** Added `enum` properties to `action_type`, `actor`, `confidence`, `insight_type`, and `type` (UI Component) in the JSON schemas within `services/geminiService.ts`. This ensures the LLM output strictly adheres to the TypeScript types defined in `types.ts`.

### Phase 2: Eliminate Prompt Pollution
**Goal:** Stop instructing the LLM to generate metadata events that break the data model.

*   **Step 2.1: Cleanse `PHASE_B_SYSTEM_PROMPT`**
    *   **Target:** `constants.ts`
    *   **Spec:** 
        *   Locate `PHASE_B_SYSTEM_PROMPT`.
        *   Remove the instruction: *"ANNOTATE boundaries: insert an event of type 'chunk_boundary' at each transition."*
        *   Remove any examples showing `chunk_boundary` in the prompt.
    *   **Test:** Verify the prompt string no longer contains the word `chunk_boundary`.
    *   **Implementation:** Removed the instruction to insert `chunk_boundary` events from `PHASE_B_SYSTEM_PROMPT` in `constants.ts`. Also removed `chunk_boundary` from the `ActionType` union in `types.ts` and removed the rendering logic for boundary nodes in `components/ResultsTimeline.tsx`.

### Phase 3: Context Continuity for Pass 2 (Narration)
**Goal:** Prevent overlapping narrative steps and ID resets by passing the end-state of the previous chunk into the next chunk's prompt.

*   **Step 3.1: Update `analyzeNarrationSegment` Signature**
    *   **Target:** `services/geminiService.ts`
    *   **Spec:** 
        *   Add a new parameter: `previousSteps: NarrativeStep[] = []`.
    *   **Implementation:** Added `previousSteps: NarrativeStep[] = []` to the parameter list of `analyzeNarrationSegment` in `services/geminiService.ts`.
*   **Step 3.2: Inject Context into `PASS_2_SYSTEM_PROMPT`**
    *   **Target:** `constants.ts`
    *   **Spec:** 
        *   Update `PASS_2_SYSTEM_PROMPT` to include a placeholder `{previous_steps_context}`.
        *   Add instructions: *"CONTINUITY: You are continuing a narrative. Here are the last few steps from the previous segment: {previous_steps_context}. DO NOT repeat these steps. Start your new steps immediately after the last event described."*
    *   **Implementation:** Added the `{previous_steps_context}` placeholder and continuity instructions to `PASS_2_SYSTEM_PROMPT` in `constants.ts`.
*   **Step 3.3: Pass Context in Service**
    *   **Target:** `services/geminiService.ts` (inside `analyzeNarrationSegment`)
    *   **Spec:** 
        *   Format `previousSteps` (take the last 3-5 steps) into a readable string or JSON.
        *   Replace `{previous_steps_context}` in the prompt. If `previousSteps` is empty, replace with *"This is the beginning of the video."*
    *   **Implementation:** In `services/geminiService.ts`, formatted `previousSteps` into a JSON string (or a default string if empty) and replaced the `{previous_steps_context}` placeholder in the prompt.
*   **Step 3.4: Wire up State in Job Manager**
    *   **Target:** `server/jobManager.ts`
    *   **Spec:** 
        *   In the Phase C execution loop, pass `cumulativeNarrative.slice(-3)` as the `previousSteps` argument to `analyzeNarrationSegment`.
    *   **Test:** Run `compile_applet` to ensure the new function signature is correctly typed and utilized.
    *   **Implementation:** In `server/jobManager.ts`, updated the call to `analyzeNarrationSegment` to pass `cumulativeNarrative.slice(-3)` as the `previousSteps` argument.

### Phase 4: Deprecate or Align Python Post-Processor
**Goal:** Ensure the offline Python script does not corrupt the React app's data model if used.

*   **Step 4.1: Update `postprocess.py`**
    *   **Target:** `postprocess.py`
    *   **Spec:** 
        *   Revert `time_range` back to `timestamp` (string) for `NarrativeStep`.
        *   Map Python's `insight_type` normalization to the exact literals in `types.ts` (`explanation`, `rationale`, etc.).
        *   Ensure the `chunks` array output matches the `Chunk` interface in `types.ts`.
    *   **Test:** Run the python script on a sample JSON and verify the output keys match `types.ts` exactly.
    *   **Implementation:** Updated `postprocess.py` to revert the `time_range` object back to a simple `timestamp` string. Updated the `insight_map` to use the exact literals from `types.ts` (e.g., `workflow_framing`, `explanation`, `tip`). Removed the logic that mutated the `chunks` array based on `chunk_boundary` events, as those events are no longer generated.

---

## Execution Instructions for LLM
To implement this plan, execute the steps in order:
1. Use `shell_exec` (grep) to verify the exact definitions of enums in `types.ts`.
2. Use `edit_file` to update `services/geminiService.ts` with the `enum` properties.
3. Use `edit_file` to update `constants.ts` (remove prompt pollution, add context placeholders).
4. Use `edit_file` to update `services/geminiService.ts` and `server/jobManager.ts` to pass `previousSteps`.
5. Run `compile_applet` and `lint_applet` to verify the build.
