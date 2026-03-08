
# PLAN: Tutorial Dissector Architecture

**"Tutorial Dissector"** is a full-stack application that extracts an ultra-detailed, timestamped **Verifiable Execution Graph** from software tutorial videos. It uses Gemini 3.1 Pro Preview's native video and spatial understanding to produce a strictly typed relational tree of BDD intents and deterministic mechanical actions, capable of being compiled directly into Playwright automation scripts.

## 1. Tech Stack & Infrastructure
- **Frontend:** React 19 + Tailwind CSS (via CDN/ESM).
- **State Persistence:** Browser `IndexedDB` (via `idb-keyval`). Projects are indexed and individual project data is stored under `td_project_<id>`.
- **AI Backend:** Express server (`server.ts`) using `@google/genai` SDK with `gemini-3.1-pro-preview` for deep video understanding and structured JSON output.

## 2. Single-Pass Execution Graph Analysis (Data Flow)

The system operates in a single sequential loop managed within the backend `server/jobManager.ts`, processing each chunk through multiple phases.

### Phase A: Visual & Spatial Extraction (The Mechanical Track)
This pass focuses purely on *deterministic spatial events and state mutations*. It operates on 1-minute chunks of video.

*   **Phase A (Stateless Perception):** 
    *   **Input:** Video URL + `clipStart` / `clipEnd` offsets.
    *   **Action:** Gemini is prompted to extract raw clicks, drags, keystrokes, and editorial annotations (title cards, highlights, etc.).
    *   **Output:** Arrays of unlinked `ActionItem` objects (with normalized bounding boxes) and `VideoAnnotation` objects.
*   **Phase B (Stateful Cognition):**
    *   **Input:** The output of Phase A + Chat History of all previous Phase B chunks.
    *   **Action:** Gemini is prompted to deduplicate actions and annotations within the overlap window, assign unique truncated-UUID-based IDs (e.g., `evt_a1b2c3d4`, `ann_e5f6g7h8`), flag `is_error_recovery` mistakes, and snapshot the active `UI_Context`.
    *   **Optimization ("Zipper"):** Strips `ui_context` before sending to the LLM to save tokens. Re-attaches it afterward using a cascading fallback (strict/moderate content matching) to prevent data loss if the LLM hallucinates or drops IDs.

### Phase C: Hierarchical BDD Mapping (The Intent Track)
This phase runs *per chunk*, immediately after Phase B.

*   **Logic:** Iterates through the video using the same chunks as Phase A.
*   **Input:** Video audio + The finalized arrays of `ActionItems` and `VideoAnnotations` (filtered to the current timeframe with a 15-second buffer).
*   **Action:** Gemini maps spoken audio to the mechanical actions and editorial annotations.
*   **Output:** Generates `NarrativeStep` objects containing `intent`, `explanation`, `insight_type`, `topics`, BDD `precondition` / `postcondition` strings, and `linked_visual_action_ids` / `linked_annotation_ids` arrays that act as Foreign Keys to the `ActionItems` and `VideoAnnotations`.

### Phase D: Global Deduplication
This phase runs *after* all chunks are complete.

*   **Logic:** A final pass over all accumulated `ActionItems`.
*   **Input:** The complete array of `ActionItems` and `customContext`.
*   **Action:** Gemini identifies and removes duplicate actions that may have slipped through the chunk boundaries.
    *   **Optimization ("Zipper"):** Strips `ui_context` and `chunkIndex` before sending the global action list to the LLM to prevent exceeding the context window. Re-attaches them afterward using the same cascading fallback as Phase B.
*   **Output:** A finalized, deduplicated array of `ActionItems`, with `NarrativeStep` links remapped for any removed duplicate actions (pointing the orphaned link to the surviving action).

## 3. Mathematical Chunking Strategy
To ensure continuity, the video is chunked with an overlapping sliding window (`utils/timeUtils.ts`).

*   **Chunk Size:** Default 60s (1 min).
*   **Overlap:** Default 30s.
*   **Logic:** For a chunk spanning 01:00 to 02:00 (`primaryStart` to `primaryEnd`):
    *   The model is actually fed video from 00:30 to 02:30 (`clipStart` to `clipEnd`).
    *   It uses the pre-roll/post-roll for context, but is strictly instructed (via prompt) to ONLY log new actions occurring within the primary window.

## 4. UI Component Hierarchy
1.  **`App`**: Top-level router. Switches between Dashboard and active Project.
2.  **`Dashboard`**: Reads `IndexedDB` index. Handles creation/deletion of projects.
3.  **`AnalysisView`**: The heavy lifter. Submits jobs to the backend, polls for updates, and manages the timer. It also hosts the `ReactPlayer` instance for video playback.
    *   **`InputPanel`**: Sidebar controls for offsets, video URL, and starting the analysis.
    *   **`ChunkVisualizer`**: Bottom ticker showing the real-time status of Phase A/B chunk processing.
    *   **`ResultsTimeline`**: The main view. Takes the flat `actions`, `annotations`, and `narrativeSteps` arrays, builds a relational tree in memory (`useMemo`), renders it, and houses the JSON/Playwright exporters. It features two-way synchronization with the video player (clicking a step seeks the video, and playing the video auto-scrolls the timeline to highlight the active step).
