
# PLAN: Tutorial Dissector Architecture

**"Tutorial Dissector"** is a client-side web application that extracts an ultra-detailed, timestamped **Verifiable Execution Graph** from software tutorial videos. It uses Gemini 3.1 Pro Preview's native video and spatial understanding to produce a strictly typed relational tree of BDD intents and deterministic mechanical actions, capable of being compiled directly into Playwright automation scripts.

## 1. Tech Stack & Infrastructure
- **Frontend:** React 19 + Tailwind CSS (via CDN/ESM).
- **State Persistence:** Browser `localStorage`. Projects are indexed in `td_projects_index` and individual project data is stored under `td_project_<id>`.
- **AI Backend:** `@google/genai` SDK using `gemini-3.1-pro-preview` for deep video understanding and structured JSON output.

## 2. Two-Pass Execution Graph Analysis (Data Flow)

The system operates in two distinct, sequential loops managed within `AnalysisView.tsx`.

### Pass 1: Visual & Spatial Extraction (The Mechanical Track)
This pass focuses purely on *deterministic spatial events and state mutations*. It operates on 5-minute chunks of video.

*   **Phase A (Stateless Perception):** 
    *   **Input:** Video URL + `clipStart` / `clipEnd` offsets.
    *   **Action:** Gemini is prompted to extract raw clicks, drags, and keystrokes.
    *   **Output:** Array of unlinked `ActionItem` objects with normalized `[ymin, xmin, ymax, xmax]` bounding boxes and exact `input_data`.
*   **Phase B (Stateful Cognition):**
    *   **Input:** The output of Phase A + Chat History of all previous Phase B chunks.
    *   **Action:** Gemini is prompted to deduplicate actions within the overlap window, assign unique `evt_001` IDs, flag `is_error_recovery` mistakes, and snapshot the active `UI_Context`.

### Pass 2: Hierarchical BDD Mapping (The Intent Track)
This pass runs *after* all visual chunks are complete.

*   **Logic:** Iterates through the video in larger 15-minute chunks.
*   **Input:** Video audio + The finalized array of `ActionItems` (filtered to the current timeframe to save context).
*   **Action:** Gemini maps spoken audio to the mechanical actions.
*   **Output:** Generates `NarrativeStep` objects containing BDD `precondition` / `postcondition` strings, and a `linked_visual_action_ids` array that acts as a Foreign Key to the `ActionItems`.

## 3. Mathematical Chunking Strategy
To ensure continuity, the video is chunked with an overlapping sliding window (`utils/timeUtils.ts`).

*   **Chunk Size:** Default 300s (5 mins).
*   **Overlap:** Default 60s.
*   **Logic:** For a chunk spanning 05:00 to 10:00 (`primaryStart` to `primaryEnd`):
    *   The model is actually fed video from 04:00 to 11:00 (`clipStart` to `clipEnd`).
    *   It uses the pre-roll/post-roll for context, but is strictly instructed (via prompt) to ONLY log new actions occurring within the primary window.

## 4. UI Component Hierarchy
1.  **`App`**: Top-level router. Switches between Dashboard and active Project.
2.  **`Dashboard`**: Reads `localStorage` index. Handles creation/deletion of projects.
3.  **`AnalysisView`**: The heavy lifter. Orchestrates the `useEffect` async processing loops, maintains `useRef` backups for state, and manages the timer.
    *   **`InputPanel`**: Sidebar controls for offsets, video URL, and starting the analysis.
    *   **`ChunkVisualizer`**: Bottom ticker showing the real-time status of Phase A/B chunk processing.
    *   **`ResultsTimeline`**: The main view. Takes the flat `actions` and `narrativeSteps` arrays, builds a relational tree in memory (`useMemo`), renders it, and houses the JSON/Playwright exporters.
