
# PROGRESS & SYSTEM DOCUMENTATION: Tutorial Dissector

**VERSION:** 1.2.0 (Narration Update)
**LAST UPDATED:** Current Session

## 1. PROJECT STATUS: FEATURE COMPLETE

The application successfully implements the complex **Two-Pass Hybrid Architecture**.

### ✅ Completed Features
*   **Pass 1: Visual Extraction**
    *   **Phase A (Perception):** `gemini-3-pro-preview` with `videoMetadata` offsets for high-res visual analysis.
    *   **Phase B (Cognition):** `interactions` API with `previous_interaction_id` for stateful deduplication and UI state tracking.
*   **Pass 2: Narration Synthesis**
    *   **Audio Analysis:** Processes audio in larger (15-min) chunks for context.
    *   **Context Anchoring:** Injects a filtered list of Visual Actions into the prompt to ground the narration.
    *   **Intent Synthesis:** Produces a polished "Technical Writer" log, not a verbatim transcript.
*   **Robustness:**
    *   **Retry Logic:** Exponential backoff (2s/4s/8s).
    *   **JSON Repair:** Automatic prompt injection to fix malformed responses.
    *   **Loop Separation:** Strict separation of Visual and Narration loops in `AnalysisView`.
*   **User Interface:**
    *   **Real-time Timeline:** Distinct rendering for Narration (Pink) vs Visual (Blue/Gray) events.
    *   **Insight Badges:** Visual indicators for "Tips", "Warnings", "Rationale".
    *   **Stats:** Live token usage and progress tracking for both passes.

### 🚧 Known Limitations / Future Work
*   **Video Duration:** Currently requires manual input (MM:SS).
*   **Cost:** Two-pass analysis increases token consumption (Visual ~87k/chunk + Narration ~300k/chunk).

---

## 2. SYSTEM DOCUMENTATION (FOR LLM AGENTS)

**TARGET AUDIENCE:** LLM Coding Agents / Automated Refactoring Tools
**CORE MODEL:** `gemini-3-pro-preview`

### A. ARCHITECTURAL INTENT: THE TWO-PASS LOOP

The application processes video in two distinct sequential passes to solve the "Context vs. Resolution" trade-off.

**Pass 1: Visual (The "What")**
*   **Goal:** High-resolution extraction of screen coordinates, clicks, and UI changes.
*   **Constraint:** Requires short chunks (3-5 min) to maintain visual fidelity.
*   **Mechanism:** `generateContent` (Visual) -> `interactions` (Merge).

**Pass 2: Narration (The "Why")**
*   **Goal:** Capture high-level intent, rationale, and tips.
*   **Constraint:** Requires long context to understand flow.
*   **Mechanism:** `generateContent` (Audio).
*   **Critical Logic: The Context Buffer**
    *   When analyzing audio from `T_start` to `T_end`, we do **not** simply slice the visual log at `T_start`.
    *   We inject visual actions from `T_start - 15s` to `T_end + 15s`.
    *   *Why?* Narrators often describe an action ("I'm going to click...") seconds before doing it. This buffer allows the LLM to link the speech to the future/past event (`relates_to` field).

### B. INVARIANTS & CRITICAL CONSTRAINTS

**VIOLATING THESE WILL BREAK THE APPLICATION:**

1.  **API Surface Separation:**
    *   Video Clipping (`videoMetadata`) is **ONLY** valid in `generateContent`.
    *   Stateful Conversation (`previous_interaction_id`) is **ONLY** valid in `interactions`.
2.  **Prompt Strategy:**
    *   **Narration Prompt:** Must explicitly instruct the model **NOT** to transcribe verbatim. The output must be synthesized instructional text.
    *   **Timestamps:** Narration timestamps must reflect the *audio start*, independent of the visual event it describes.
3.  **Config Casing:**
    *   `generateContent`: **camelCase**.
    *   `interactions`: **snake_case**.

### C. CODEBASE ANATOMY

*   **`components/AnalysisView.tsx`**: Contains the two `useEffect` loops.
    *   Loop 1: Iterate chunks for Visual Analysis.
    *   Loop 2: Iterate time for Narration Analysis.
*   **`services/geminiService.ts`**:
    *   `analyzeChunkPhaseA`: Visual extraction.
    *   `accumulateChunkPhaseB`: Merge logic.
    *   `analyzeNarrationSegment`: Audio analysis (Pass 2).
*   **`constants.ts`**: Holds the 3 System Prompts. `PASS_2_SYSTEM_PROMPT` defines the Narration persona.

### D. DATA FLOW SIMULATION (NARRATION PASS)

**Scenario:** Analyzing Audio 05:00 - 15:00.

1.  **Input:** Full list of `actions` generated in Pass 1.
2.  **Filtering:** `AnalysisView` filters `actions` to range `04:45` to `15:15` (The 15s buffer).
3.  **API Call:** `geminiService` sends this filtered JSON + the Video File to Gemini.
4.  **Prompt:** "You are a Technical Writer. Here is what happened visually [JSON]. Listen to the audio and explain *why*."
5.  **Output:** New `ActionItem`s of type `narration` with `relates_to` pointers.
