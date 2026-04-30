# Prompt Formatting & Injection Analysis

## 1. The Core Problem
The current implementation of the Gemini API prompts injects massive amounts of dynamic payload data directly into the `systemInstruction` (System Prompt) rather than the `contents` (User Prompt). 

By analyzing the captured API requests in the `test-output` directory, we observed the following token distribution:
* `prompt_PhaseA_0_75_attempt1.json`: System length: **58,101** | User contents length: 344
* `prompt_PhaseB_chunk1_attempt1.json`: System length: 52,167 | User contents length: 10,315
* `prompt_PhaseC_114_186_attempt1.json`: System length: **68,469** | User contents length: 347
* `prompt_PhaseD_attempt1.json`: System length: **93,594** | User contents length: **2**

Phase D is sending almost 100,000 characters entirely as the `systemInstruction`, with essentially an empty string for the actual user prompt (length 2, e.g., `""` or `{}`).

## 2. Root Cause in the Codebase
In `constants.ts`, the prompt templates (like `PASS_2_SYSTEM_PROMPT`) are defined as monolithic strings that include injection markers for the dynamic data:
* `{start_time}`
* `{end_time}`
* `{previous_steps_context}`
* `{visual_actions}`
* `{annotations}`

These templates are passed identically as the system instruction. The dynamic data arrays are stringified and injected into these placeholders *prior* to configuring the model. 

## 3. Consequences
* **Model Confusion & Context Rot:** LLMs prioritize system instructions for behavioral rules. When tens of thousands of tokens of literal data (like JSON visual actions) are crammed into the system prompt, the model loses the instructions (the "how to behave") within the noise of the data payload.
* **Phase D Failure:** Phase D forces the entire narrative track history into the system prompt and passes nothing to the user prompt.
* **Context Caching Issues:** Gemini's context caching relies heavily on static system prompts. By aggressively mutating the system prompt with ever-changing JSON data per chunk, context caching is effectively disabled/invalidated on every API call, driving up latency and cost.

## 4. Required Remediation
1. **Split the Prompts:** In `constants.ts`, separate the static behavior instructions from the dynamic data templates.
2. **Static System Prompt:** The `systemInstruction` should ONLY contain the agent identity, rules, output format definitions, and schemas.
3. **Dynamic User Prompt:** The generated dynamic string (`{visual_actions}`, `{annotations}`, `{previous_steps_context}`, etc.) must be constructed locally in `services/geminiService.ts` and passed as the `contents` array inside the user's turn in the chat.
4. **Update `services/geminiService.ts`:** Specifically, modify `generateContent` or `chat` parameters to ensure `systemInstruction` is just the immutable configuration rule-set.
