# PROGRESS & SYSTEM DOCUMENTATION: Tutorial Dissector

**VERSION:** 1.1.0 (Beta)
**LAST UPDATED:** Current Session

## 1. PROJECT STATUS: FEATURE COMPLETE

The application successfully implements the complex **Hybrid Clipping + Stateful Memory** architecture required to dissect videos.

### ✅ Completed Features
*   **Core Pipeline:**
    *   **Phase A (Perception):** `gemini-3-pro-preview` with `videoMetadata` offsets for high-res visual analysis.
    *   **Phase B (Cognition):** `interactions` API with `previous_interaction_id` for stateful narrative synthesis.
*   **Robustness:**
    *   **Retry Logic:** Exponential backoff (2s/4s/8s) for API failures.
    *   **Self-Correction:** Automatic prompt injection to fix malformed JSON responses from the LLM.
*   **User Interface:**
    *   **Configuration:** Video URL, Duration, Chunk Size, Overlap.
    *   **Visualization:** "Chunk Plan" ribbon, Real-time "Results Timeline".
    *   **Context Monitor:** Live view of the AI's internal state (Active App, Dialogs, Tools).
*   **Data:**
    *   **Exports:** JSON, CSV, Markdown.
    *   **Persistence:** LocalStorage session saving/resuming.

### 🚧 Known Limitations / Future Work
*   **Video Duration:** Currently requires manual input (MM:SS). Client-side auto-detection is blocked by YouTube CORS policies.
*   **YouTube Restrictions:** Private or Age-Restricted videos will fail at the API level (Google GenAI SDK limitation).
*   **Cost Management:** High-resolution video analysis is token-intensive (~87k tokens per 5-min chunk).

---

## 2. SYSTEM DOCUMENTATION (FOR LLM AGENTS)

**TARGET AUDIENCE:** LLM Coding Agents / Automated Refactoring Tools
**CORE MODEL:** `gemini-3-pro-preview`
**SDK:** `@google/genai` (v1.33+)

### A. ARCHITECTURAL INTENT

This application solves the "Long Context vs. High Resolution" trade-off. It does not ingest the entire video at once.

**The Two-Phase Pipeline:**
1.  **Phase A (Stateless Perception):** 
    *   Uses `generateContent` with `videoMetadata`.
    *   *Intent:* Isolate high-fidelity visual analysis. The model looks at *only* 5 minutes of pixels to catch small UI details. It has no memory.
2.  **Phase B (Stateful Synthesis):** 
    *   Uses `interactions` (Chat) API.
    *   *Intent:* Maintain narrative continuity. Receives raw Phase A data, stitches it into a coherent timeline, resolves duplicates from overlap zones, and tracks global application state.

### B. INVARIANTS & CRITICAL CONSTRAINTS

**VIOLATING THESE WILL BREAK THE APPLICATION:**

1.  **Model IDs:** MUST use `-preview` suffix (e.g., `gemini-3-pro-preview`).
2.  **API Surface Separation:**
    *   Video Clipping is **ONLY** supported in `ai.models.generateContent`.
    *   Stateful Conversation is **ONLY** supported in `client.interactions.create`.
    *   *Do not attempt to pass `videoMetadata` to the Interactions API.*
3.  **Casing Discipline:**
    *   `generateContent` config uses **camelCase** (e.g., `thinkingConfig`, `mediaResolution`).
    *   `interactions` config uses **snake_case** (e.g., `thinking_level`, `media_resolution`).
4.  **Retry Logic:** The `analyzeChunkPhaseA` and `accumulateChunkPhaseB` functions in `services/geminiService.ts` implement specific retry loops to handle JSON syntax errors and network instability. **Do not remove.**

### C. CODEBASE ANATOMY

*   **`services/geminiService.ts`**: The Engine. Handles API calls, retries, and prompt injection.
*   **`App.tsx`**: The Orchestrator. Manages the recursive processing loop using `useRef` to prevent stale closures. Handles session persistence.
*   **`constants.ts`**: The Persona. Contains the extensive system prompts (`PHASE_A` and `PHASE_B`) that define the output schema.
*   **`utils/timeUtils.ts`**: The Logic. Calculates overlapping time windows (`computeChunkWindows`).

### D. DATA FLOW SIMULATION

**Scenario:** Processing Chunk 2 (05:00 - 10:00).

1.  **Plan:** `computeChunkWindows` creates Chunk 2.
    *   Primary: 05:00 - 10:00.
    *   Clip (sent to AI): 04:00 - 11:00 (assuming 60s overlap).
2.  **Phase A Execution:**
    *   `geminiService` calls `generateContent` with `startOffset: 240s`, `endOffset: 660s`.
    *   Model returns raw list of actions.
3.  **Phase B Execution:**
    *   `geminiService` calls `interactions.create`.
    *   Input: Raw actions + `previous_interaction_id` (from Chunk 1).
    *   Output: Cleaned events + Updated UI State.
4.  **State Update:** `App.tsx` appends to `actions`, saves to `localStorage`, and advances `currentChunkIndex`.

---

## 3. EXTENSIBILITY

*   **Adding Action Types:** Update `ActionType` in `types.ts` AND `PHASE_A_SYSTEM_PROMPT` in `constants.ts`.
*   **Improving Accuracy:** Modify `constants.ts`.
*   **New Export Formats:** Modify `ResultsTimeline.tsx`.
