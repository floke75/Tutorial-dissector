
# AGENTS.md - Technical Onboarding & Core Directives

> **WARNING TO ALL LLM AGENTS:** Read this document entirely before modifying the codebase. This application uses complex, long-running asynchronous React state loops and highly strict structured JSON outputs from the Gemini API.

## 1. System Architecture & Directory Map

The application is a client-side React SPA that uses `localStorage` for persistence and talks directly to the `@google/genai` SDK.

*   **`types.ts`**: The source of truth for the **Verifiable Execution Graph**. Contains definitions for `ActionItem` (mechanics) and `NarrativeStep` (intent). If you add a feature, update the types here first.
*   **`constants.ts`**: Contains the raw system prompts for Phase A, Phase B, and Pass 2. Prompt engineering happens here.
*   **`services/geminiService.ts`**: Handles all LLM API calls. **Crucially, it maps `types.ts` into Gemini SDK `Type.OBJECT` schemas.**
*   **`services/storage.ts`**: Wraps `localStorage`. Handles project creation, saving, and indexing.
*   **`utils/timeUtils.ts`**: Mathematical utilities for overlapping chunk windows (`clipStart`/`clipEnd` vs `primaryStart`/`primaryEnd`).
*   **`components/AnalysisView.tsx`**: The core orchestrator. Contains the two massive async `useEffect` loops (Visual and Narration).
*   **`components/ResultsTimeline.tsx`**: The renderer and compiler. It maps the relational tree and contains the `downloadPlaywright()` automation compiler.

## 2. The Verifiable Execution Graph (Data Model)

This app doesn't output flat text; it builds a highly normalized relational database:

1.  **`ActionItem` (Mechanics):** Represents exact user interactions (clicks, types).
    *   *Crucial properties:* `target.spatial_bounding_box` (normalized 0-1000 `[y1, x1, y2, x2]`), `input_data.keys_pressed` (e.g. `["Ctrl", "C"]`), and `is_error_recovery` (boolean flagging human mistakes).
2.  **`NarrativeStep` (Intent):** Represents high-level BDD steps.
    *   *Crucial properties:* `precondition` (Given), `postcondition` (Then), and `linked_visual_action_ids` (Foreign Keys pointing to `ActionItem.id`).

## 3. Strict Implementation Rules (DO NOT VIOLATE)

### Rule A: State Management & Stale Closures
Because video analysis takes minutes, `AnalysisView.tsx` uses asynchronous `useEffect` loops.
*   **NEVER** rely directly on `procState` inside the `setInterval` or `processNextVisual`/`processNextNarration` async functions.
*   **ALWAYS** use `stateRef.current`, `chunksRef.current`, and `actionsRef.current`. If you add new state that the async loop needs to read, you MUST back it with a `useRef` to prevent stale closure bugs.

### Rule B: Gemini SDK Usage
*   We use the `@google/genai` SDK (`>= 1.41.0`).
*   **Video Offsets:** When passing video to Gemini, use the `videoMetadata` payload to clip the video natively without FFMPEG:
    ```typescript
    fileData: { fileUri: videoUrl, mimeType: 'video/*' },
    videoMetadata: { startOffset: `${startSec}s`, endOffset: `${endSec}s` }
    ```
*   **Schema Resilience:** Bounding boxes must use `Type.NUMBER` (not `INTEGER`) because Gemini occasionally returns float values (e.g., `150.5`).

### Rule C: Automation Compilation (Playwright)
*   **Viewport Normalization:** The spatial extraction prompts force Gemini to map the screen to a `1000x1000` grid. Therefore, `ResultsTimeline.tsx` hardcodes `page.setViewportSize({ width: 1000, height: 1000 })` so Cartesian coordinates map 1:1.
*   **Error Exclusion:** The compiler script MUST include `.filter(a => !a.is_error_recovery)`. The bot must not execute human mistakes.

## 4. How to Modify the Extraction Pipeline
If a user asks you to extract a new type of data (e.g., "Extract cursor shapes"):
1.  Update `types.ts` (`ActionItem` or `UIContext`).
2.  Update the Schema objects in `services/geminiService.ts` to enforce the new type.
3.  Update the specific Prompt in `constants.ts` to instruct the model on *how* to extract it.
4.  Update `components/ResultsTimeline.tsx` to render it.
