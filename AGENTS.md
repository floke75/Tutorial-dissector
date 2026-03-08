
# AGENTS.md - Technical Onboarding & Core Directives

> **WARNING TO ALL LLM AGENTS:** Read this document entirely before modifying the codebase. This application uses complex, long-running asynchronous React state loops and highly strict structured JSON outputs from the Gemini API.

## 1. System Architecture & Directory Map

The application is a **full-stack** application: a React 19 SPA frontend backed by an Express server (`server.ts`). The frontend stores project data in **IndexedDB** (via `idb-keyval`). All Gemini API calls are made **server-side** via `server/jobManager.ts`, which imports from `services/geminiService.ts`.

*   **`types.ts`**: The source of truth for the **Verifiable Execution Graph**. Contains definitions for `ActionItem` (mechanics) and `NarrativeStep` (intent). If you add a feature, update the types here first.
*   **`constants.ts`**: Contains the raw system prompts for Phase A (`PHASE_A_SYSTEM_PROMPT`), Phase B (`PHASE_B_SYSTEM_PROMPT`), Phase C (`PASS_2_SYSTEM_PROMPT`), and Phase D (`GLOBAL_DEDUPLICATION_PROMPT`). Prompt engineering happens here.
*   **`services/geminiService.ts`**: Handles all LLM API calls. **Crucially, it maps `types.ts` into Zod schemas compiled via `zodToJsonSchema`.**
*   **`services/storage.ts`**: Wraps `IndexedDB` (via `idb-keyval`). Handles project creation, saving, and indexing.
*   **`utils/timeUtils.ts`**: Mathematical utilities for overlapping chunk windows (`clipStart`/`clipEnd` vs `primaryStart`/`primaryEnd`).
*   **`components/AnalysisView.tsx`**: The core frontend orchestrator. Submits jobs to the backend, polls for updates, and hosts the `ReactPlayer` instance for video playback.
*   **`components/ResultsTimeline.tsx`**: The renderer and compiler. It maps the relational tree, handles two-way video synchronization (auto-scrolling and seeking), and contains the `downloadPlaywright()` automation compiler.

## 2. The Verifiable Execution Graph (Data Model)

This app doesn't output flat text; it builds a highly normalized relational database:

1.  **`ActionItem` (Mechanics):** Represents exact user interactions (clicks, types).
    *   *Crucial properties:* `target.spatial_bounding_box` (normalized 0-1000 `[y1, x1, y2, x2]`), `input_data.keys_pressed` (e.g. `["Ctrl", "C"]`), and `is_error_recovery` (boolean flagging human mistakes).
2.  **`NarrativeStep` (Intent):** Represents high-level BDD steps.
    *   *Crucial properties:* `precondition` (Given), `postcondition` (Then), and `linked_visual_action_ids` (Foreign Keys pointing to `ActionItem.id`).

## 3. Strict Implementation Rules (DO NOT VIOLATE)

### Rule A: State Management & Job Polling
Because video analysis takes minutes, the React frontend submits jobs to the Express backend and polls for updates.
*   **NEVER** implement long-running analysis loops in the React frontend.
*   **ALWAYS** use the backend `server/jobManager.ts` for orchestrating the Gemini API calls and state transitions.

### Rule B: Gemini SDK Usage
*   We use the `@google/genai` SDK (`>= 1.41.0`).
*   **Video Offsets:** When passing video to Gemini, use the `videoMetadata` payload to clip the video natively without FFMPEG:
    ```typescript
    fileData: { fileUri: videoUrl, ...(videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be') ? {} : { mimeType: 'video/mp4' }) },
    videoMetadata: { startOffset: `${startSec}s`, endOffset: `${endSec}s` }
    ```
*   **Schema Resilience:** Bounding boxes must use `z.number()` (not `z.number().int()`) because Gemini occasionally returns float values (e.g., `150.5`).

### Rule C: Automation Compilation (Playwright)
*   **Viewport Normalization:** The spatial extraction prompts force Gemini to map the screen to a `1000x1000` grid. Therefore, `ResultsTimeline.tsx` hardcodes `page.setViewportSize({ width: 1000, height: 1000 })` so Cartesian coordinates map 1:1.
*   **Error Exclusion:** The compiler script MUST include `.filter(a => !a.is_error_recovery)`. The bot must not execute human mistakes.

### Rule D: Context Flow & Dynamic Accumulation
*   **Chat History (Phase B):** The Gemini SDK requires `chatHistory` to strictly alternate between `user` and `model` roles, always starting with `user`. The sliding window in `jobManager.ts` retains up to 60 items (30 turns) to leverage the large context window while enforcing this rule.
*   **"Zipper" Optimization:** To prevent token exhaustion in Phase B and Phase D, heavy metadata (`ui_context`, `chunkIndex`) is stripped from actions before sending them to the LLM, and re-attached afterward using a cascading content-similarity fallback to handle ID drift.
*   **Dynamic Context (Phase C):** Phase C extracts `learned_insights` (factual UI terminology only, e.g., panel names and persistent global state changes) which are appended to a `learnedContext` string. This string is injected into the prompt for all subsequent chunks, allowing the pipeline to accumulate stable domain vocabulary as it processes the video.
*   **Token Optimization (Phase D):** Global deduplication receives the cumulative narrative to inform its decisions. To prevent token exhaustion, the narrative array is minified (id, description, links) before being passed to the LLM.

## 4. How to Modify the Extraction Pipeline
If a user asks you to extract a new type of data (e.g., "Extract cursor shapes"):
1.  Update `types.ts` (`ActionItem` or `UIContext`).
2.  Update the Schema objects in `services/geminiService.ts` to enforce the new type.
3.  Update the specific Prompt in `constants.ts` to instruct the model on *how* to extract it.
4.  Update `components/ResultsTimeline.tsx` to render it.
