
# AGENTS.md - Project Context & Onboarding

> **Directives for LLM Agents:** Read this file first. It contains the strict architectural invariants, API constraints, and state management rules required to modify this codebase without breaking core functionality.

## 1. Project Overview
**Name:** Tutorial Dissector
**Goal:** Extract ultra-detailed, timestamped user action logs from software tutorial videos (YouTube).
**Core Mechanism:** 
1.  **Pass 1 (Visual):** Splits video into overlapping chunks for high-res visual analysis, stitched via stateful memory.
2.  **Pass 2 (Narration):** Scans audio in larger chunks, using the visual log as context to synthesize a narrative track.

## 2. Tech Stack & Dependencies
*   **Runtime:** Browser (React + Vite/ESM)
*   **Styling:** Tailwind CSS (CDN injected)
*   **AI SDK:** `@google/genai` (>= v1.33.0)
*   **State Persistence:** `localStorage` (Session keys)

## 3. Architecture: "The Two-Pass Loop"

The system addresses the trade-off between *visual resolution* and *context window limits*.

### Pass 1: Visual Extraction
*   **Phase A: Perception (Stateless)**
    *   **Method:** `ai.models.generateContent` with `videoMetadata`.
    *   **Goal:** Extract raw clicks, types, and UI changes.
*   **Phase B: Synthesis (Stateful)**
    *   **Method:** `client.interactions.create` with `previous_interaction_id`.
    *   **Goal:** Deduplicate events and maintain UI state (e.g., "Dialog X is open").

### Pass 2: Narration Synthesis
*   **Phase C: Context-Aware Audio**
    *   **Method:** `ai.models.generateContent` (Audio focus).
    *   **Goal:** Synthesize intent ("Why are we doing this?") and link it to visual events.
    *   **Critical Strategy:** **Loose Anchoring**.
        *   The prompt receives visual actions from a **widened window (+/- 15s)**.
        *   The model links speech to visual events via a logical `relates_to` field, not by forcing timestamps to match.

## 4. STRICT API INVARIANTS (Do Not Violate)

1.  **Clipping Boundary:** `videoMetadata` is **ONLY** valid in `generateContent`.
2.  **Context Boundary:** `previous_interaction_id` is **ONLY** valid in `interactions`.
3.  **Prompt Engineering:**
    *   Pass 2 Prompt MUST explicitly forbid verbatim transcription.
    *   Pass 2 Prompt MUST instruct independent timing for speech vs action.
4.  **Config Casing:**
    *   `generateContent`: **camelCase**.
    *   `interactions`: **snake_case**.
5.  **Model Version:** Must use `-preview` models.

## 5. State Management Strategy
*   **React `useRef`:** Used for the processing loops to avoid stale closure issues during long-running async operations.
*   **Separation of Concerns:** `procState.status` transitions from `running_visual` -> `running_narration`. These are distinct loops in `AnalysisView`.

## 6. Prompt Engineering (`constants.ts`)
*   **Phase A:** "Computer Vision Expert". Strict JSON.
*   **Phase B:** "Historian/Editor". Consistency checker.
*   **Pass 2:** "Technical Writer". Synthesizer.

## 7. Common Tasks & Snippets

### Modifying Narration Logic
*   Edit `PASS_2_SYSTEM_PROMPT` in `constants.ts`.
*   Adjust buffer size in `AnalysisView.tsx` (`relevantActions` filter).

### Debugging JSON Errors
*   Check `services/geminiService.ts` -> `analyzeChunkPhaseA`.
*   The code automatically injects "CRITICAL: Valid JSON only" on retry if parsing fails.

## 8. Known Limitations
*   **Duration Input:** Must be manual (CORS blocks YouTube data API).
*   **Token Cost:** High resolution video analysis is expensive (~87k tokens/5min).
