
Build a web application called **"Tutorial Dissector"** that extracts ultra-detailed, timestamped user action logs from software tutorial videos on YouTube. It uses Gemini 3 Pro's video understanding to produce a rigidly structured event-by-event description of everything that happens on screen, followed by a synthesized narrative track.

### Tech stack

- **Frontend:** Single-page HTML/CSS/JS app (vanilla or lightweight framework, your choice)
- **Backend:** Node.js with ==@google/genai== SDK (version ≥ 1.33.0)
- **APIs:** Gemini ==ai.models.generateContent()== for video chunk analysis, Gemini Interactions API (==client.interactions.create()==) for stateful session memory.

### Architecture (Two-Pass Analysis)

The system operates in two distinct sequential loops to maximize context usage and token efficiency.

#### Pass 1: Visual Extraction (Hybrid Clipping + Stateful Memory)
This pass focuses purely on *what happens on screen*.

*   **Phase A — Chunk Analysis (Perception):**
    For each time window (e.g., 5 mins), call ==ai.models.generateContent()== with ==videoMetadata== offsets. The model analyzes ONLY that segment and returns structured JSON of user actions.
*   **Phase B — Session Accumulation (Cognition):**
    Feed Phase A results into a stateful Interactions API chain. It deduplicates actions from overlap zones, validates timestamps, and tracks persistent UI state (e.g., "Dialog X is open").

#### Pass 2: Narration Synthesis (Context-Aware Audio Analysis)
This pass runs *after* visual analysis is complete. It focuses on *why it is happening*.

*   **Logic:**
    *   Iterate through the video in large audio chunks (e.g., 15 mins).
    *   For each chunk, retrieve the **Visual Action Log** generated in Pass 1.
    *   **Context Buffering:** Filter the visual log to include actions occurring **+/- 15 seconds** around the audio chunk. This allows the model to "anchor" narration to visual events that may happen slightly before or after the speech (e.g., "I'm going to click X" -> *3 seconds later* -> Click X).
*   **Prompting Strategy:**
    *   **Persona:** Technical Writer / Instructional Designer.
    *   **Goal:** Synthesize intent, clean up spoken filler, and produce a polished written log.
    *   **Anchoring:** Use a `relates_to` field to logically link spoken insights to specific visual timestamps, rather than strictly forcing them to match.

### Chunking strategy

- **Visual Pass:** 5-minute chunks with 60s overlap.
- **Narration Pass:** 15-minute chunks (audio is cheaper/faster) with a dynamic "Visual Context Window" injected into the prompt.

### System Prompts

*   **Phase A (Visual):** "Computer Vision Expert". Strict JSON. Low-level detail (clicks, types, hovers).
*   **Phase B (Merge):** "Session Historian". Consistency checks. Deduplication.
*   **Pass 2 (Narration):** "Technical Writer". Intent capture.
    *   *Constraint:* Do not transcribe verbatim. Synthesize instructions.
    *   *Constraint:* Timestamps reflect *audio start*, not visual action.

### UI Requirements

**Main screen:**
- YouTube URL & Duration inputs.
- Configurable sliders for Chunk Size/Overlap.
- **Two-Stage Status:** Clearly indicate "Visual Analysis" vs "Audio Narration" phases.

**Visualization:**
- **Chunk Ribbon:** Visual status of chunks (Pending -> Scanning -> Merging -> Complete).
- **Results Timeline:**
    - Live updating list.
    - **Narration Items:** Distinct styling (e.g., pink/purple) with "Insight Type" badges (Tip, Warning, Rationale).
    - **Visual Items:** Blue/Gray styling for raw actions.

**Export:**
- JSON/CSV/Markdown options including the new Narrative fields.
