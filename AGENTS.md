# AGENTS.md - Project Context & Onboarding

> **Directives for LLM Agents:** Read this file first. It contains the strict architectural invariants, API constraints, and state management rules required to modify this codebase without breaking core functionality.

## 1. Project Overview
**Name:** Tutorial Dissector
**Goal:** Extract ultra-detailed, timestamped user action logs from software tutorial videos (YouTube).
**Core Mechanism:** Splits video into overlapping chunks (Phase A) for high-res visual analysis, then stitches them into a continuous narrative (Phase B) using a stateful LLM session.

## 2. Tech Stack & Dependencies
*   **Runtime:** Browser (React + Vite/ESM)
*   **Styling:** Tailwind CSS (CDN injected)
*   **AI SDK:** `@google/genai` (>= v1.33.0)
*   **State Persistence:** `localStorage` (Session keys)

## 3. Architecture: "Hybrid Clipping + Stateful Memory"

The system addresses the trade-off between *visual resolution* and *context window limits*.

### Phase A: Perception (Stateless)
*   **Goal:** Extract raw visual events from a specific time slice.
*   **Method:** `ai.models.generateContent`
*   **Critical Feature:** Uses `videoMetadata: { startOffset, endOffset }` to perform server-side clipping.
*   **Model:** `gemini-3-pro-preview`
*   **Input:** Video URL + Time Offsets.
*   **Output:** JSON Array of `ActionItem`.

### Phase B: Synthesis (Stateful)
*   **Goal:** Deduplicate events, resolve overlaps, and maintain global state (e.g., "Dialog X is open").
*   **Method:** `client.interactions.create`
*   **Critical Feature:** Uses `previous_interaction_id` to chain the context window.
*   **Model:** `gemini-3-pro-preview`
*   **Input:** Output of Phase A + Time Window Metadata + `previous_interaction_id`.
*   **Output:** Cleaned/Merged `ActionItem` list + UI State + new `interaction.id`.

## 4. STRICT API INVARIANTS (Do Not Violate)

1.  **Clipping Boundary:** `videoMetadata` is **ONLY** valid in `generateContent`. Do not pass it to `interactions`.
2.  **Context Boundary:** `previous_interaction_id` is **ONLY** valid in `interactions`. `generateContent` is stateless.
3.  **Config Casing:**
    *   `generateContent`: Uses **camelCase** (e.g., `responseMimeType`).
    *   `interactions`: Uses **snake_case**.
    *   *Note: We rely on default settings for thinking level and media resolution to avoid configuration issues.*
4.  **Model Version:** Must use `-preview` models (e.g., `gemini-3-pro-preview`). Standard models drop necessary features.
5.  **Retry Logic:** `services/geminiService.ts` implements exponential backoff and JSON self-correction. **Never remove this.**

## 5. State Management Strategy
*   **React `useRef`:** Used for the processing loop (`processNext` in `App.tsx`) to avoid stale closure issues during long-running async operations.
*   **Progressive Persistence:** State is saved to `localStorage` after *every* chunk.
*   **Recovery:** On reload, `lastInteractionId` is restored to resume the chain.

## 6. Prompt Engineering (`constants.ts`)
*   **Phase A Prompt:** Acts as a "Computer Vision Expert". Focuses on *what* is seen. Strict JSON enforcement.
*   **Phase B Prompt:** Acts as a "Historian/Editor". Focuses on *consistency*. Handles logic like: "If chunk 1 saw a click at 4:59 and chunk 2 saw it at 5:00, merge them."

## 7. Common Tasks & Snippets

### Adding a new Action Type
1.  Modify `ActionType` in `types.ts`.
2.  Update the list in `PHASE_A_SYSTEM_PROMPT` (`constants.ts`).
3.  Update the badge color mapping in `ResultsTimeline.tsx`.

### Debugging JSON Errors
*   Check `services/geminiService.ts` -> `analyzeChunkPhaseA`.
*   The code automatically injects "CRITICAL: Valid JSON only" on retry if parsing fails.
*   Ensure the prompt in `constants.ts` doesn't have ambiguity.

### Modifying Chunk Logic
*   Edit `utils/timeUtils.ts`.
*   Note: `clipStart` must be `< primaryStart` (pre-roll) and `clipEnd` must be `> primaryEnd` (post-roll).
*   The AI is instructed to ignore actions in the roll periods unless they provide necessary context.

## 8. Known Limitations
*   **Duration Input:** Must be manual (CORS blocks YouTube data API).
*   **Token Cost:** High resolution video analysis is expensive (~87k tokens/5min).
*   **Video Access:** Private/Age-restricted videos will fail at the API level.