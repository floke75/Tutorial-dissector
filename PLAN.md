Build a web application called **"Tutorial Dissector"** that extracts ultra-detailed, timestamped user action logs from software tutorial videos on YouTube. It uses Gemini 3 Pro's video understanding to produce a rigidly structured event-by-event description of everything that happens on screen.  
  
### Tech stack  
  
- **Frontend:** Single-page HTML/CSS/JS app (vanilla or lightweight framework, your choice)  
- **Backend:** Node.js with ==@google/genai== SDK (version ≥ 1.33.0)  
- **APIs:** Gemini ==ai.models.generateContent()== for video chunk analysis (supports ==videoMetadata== clipping), Gemini Interactions API (==client.interactions.create()==) for stateful session memory  
  
### Critical API constraints (READ CAREFULLY)  
  
1. **Video clipping is ONLY available in ==ai.models.generateContent()==**, not in the Interactions API. Each chunk must be analyzed using ==generateContent()== with ==videoMetadata: { startOffset, endOffset }==.  
2. **Stateful conversation chaining is ONLY available in the Interactions API** via ==previous_interaction_id==. Use this to maintain a running session where each turn accumulates context from all previous chunks.  
3. **Model IDs must include ==-preview== suffix:** Use ==gemini-3-pro-preview== for detailed analysis.  
4. **All Interactions API fields use ==snake_case==**, not camelCase. Using camelCase causes silent failures.  
5. **Temperature:** Keep at default (1.0). Control reasoning depth via ==thinking_level== only.  
6. **YouTube video input format for generateContent:**  
```javascript
{  
  fileData: {  
    fileUri: 'https://www.youtube.com/watch?v=VIDEO_ID',  
    mimeType: 'video/*',  
  },  
  videoMetadata: {  
    startOffset: '120s',  // seconds as string  
    endOffset: '420s',  
  }  
}  
  
17. **Interactions API YouTube input format:**  
18. { type: 'video', uri: 'https://www.youtube.com/watch?v=VIDEO_ID', mime_type: 'video/*' }  
  
19. **Output access patterns differ:**  
    - ==generateContent()== → ==response.candidates[0].content.parts[0].text==  
    - Interactions API → ==interaction.outputs[interaction.outputs.length - 1].text==  
  
### Architecture (hybrid clipping + stateful memory)  
  
The system operates in two phases per chunk:  
  
**Phase A — Chunk Analysis (generateContent with clipping):**   
For each time window, call ==ai.models.generateContent()== with ==videoMetadata== to clip the YouTube video to a 3–7 minute segment. The model analyzes ONLY that segment and returns structured JSON of all user actions and events.  
  
**Phase B — Session Accumulation (Interactions API with chaining):**   
Feed the Phase A results into an Interactions API chain using ==previous_interaction_id==. Each turn receives the latest chunk's extracted actions and integrates them with the full session context. The model validates continuity (no duplicates, consistent UI state references, correct timestamp ordering), resolves any conflicts at chunk boundaries (using overlap context), and produces a clean merged log. This turn's ==interaction.id== becomes the ==previous_interaction_id== for the next chunk.  
  
```
Chunk 1: generateContent(0:00–5:00) → structured actions → interactions.create(turn 1)
Chunk 2: generateContent(4:00–9:00) → structured actions → interactions.create(turn 2, prev=turn1.id)
Chunk 3: generateContent(8:00–13:00) → structured actions → interactions.create(turn 3, prev=turn2.id)
...and so on

```
  
  
### Chunking strategy  
  
- **Default chunk size:** 5 minutes (configurable 3–7 min via UI slider)  
- **Overlap:** 60 seconds pre/post (configurable 30–90s). Overlap ensures no action is missed at boundaries.  
- **Auto-segmentation:** Given total video duration (user inputs this or we detect from metadata), compute all chunk windows automatically: ==[0:00–5:00], [4:00–9:00], [8:00–13:00], ...==  
- **The model must be instructed to ONLY log actions within its primary window** (excluding overlap margins) but to USE the overlap for context (e.g., "this dialog was already open from the previous segment").  
  
### System prompt for the video analysis (Phase A — generateContent)  
  
Use this as the system instruction for every ==generateContent()== chunk call:  
  
```
You are a precision video analysis system specializing in software tutorial recordings. Your task is to produce an exhaustive, structured log of every user action and UI event visible in this video segment.

ANALYSIS WINDOW:
- Primary window: {PRIMARY_START} to {PRIMARY_END} (log actions ONLY within this range)
- Context pre-roll: {OVERLAP_START} to {PRIMARY_START} (use for context, do NOT log as new actions)
- Context post-roll: {PRIMARY_END} to {OVERLAP_END} (use for context, do NOT log as new actions)

RULES:
1. Log EVERY discrete user action: clicks, drags, scrolls, text input, keyboard shortcuts, menu navigations, hovers that trigger tooltips, selections, right-clicks, double-clicks.
2. Log EVERY UI response: dialogs appearing/closing, panels expanding/collapsing, progress bars, loading states, error messages, notifications, animations completing, content rendering.
3. Timestamps must be in MM:SS format relative to the FULL video (not the clip).
4. Describe spatial positions precisely: "upper-left corner", "second toolbar row, third icon from left", "center of canvas area", "bottom status bar, right side".
5. Describe element sizes relatively: "dialog covering approximately 1/3 of the screen", "narrow sidebar ~20% screen width", "small tooltip near cursor".
6. Describe visual attributes: colors, icons, text labels, active/inactive states, highlight colors, cursor shape changes.
7. For text input: quote the EXACT text typed, note if autocomplete suggestions appear.
8. For keyboard shortcuts: specify exact keys (e.g., "Ctrl+Shift+P").
9. Flag moments of ambiguity: if something is partially occluded, happens too fast, or is unclear, note it explicitly with [UNCERTAIN].
10. If the screen shows code, read the EXACT code visible and note any syntax highlighting changes.

OUTPUT FORMAT: Respond ONLY with a JSON array. No markdown, no commentary.
Each element:
{
  "timestamp": "MM:SS",
  "action_type": "click|double_click|right_click|drag|scroll|type|keyboard_shortcut|hover|select|menu_navigate|system_event|ui_response|transition|narration_cue",
  "actor": "user|system|narrator",
  "target": {
    "element": "descriptive name of the UI element",
    "location": "spatial position description",
    "panel": "which panel/region of the application",
    "visual": "color, icon, size, state description"
  },
  "detail": "full natural-language description of exactly what happens",
  "result": "what changes on screen as a consequence (null if no visible change yet)",
  "context_note": "any relevant continuity note referencing prior or upcoming state (null if none)",
  "confidence": "high|medium|low"
}

```
  
  
### System prompt for session accumulation (Phase B — Interactions API)  
  
Use this as ==system_instruction== for the Interactions API chain:  
  
```
You are the session memory and quality controller for a video tutorial analysis pipeline. You maintain the authoritative, merged action log across all analyzed chunks of a software tutorial video.

VIDEO BEING ANALYZED: {VIDEO_TITLE} ({VIDEO_URL})
TOTAL DURATION: {TOTAL_DURATION}

ON EACH TURN you receive:
1. A chunk of newly extracted actions (JSON array) from the latest video segment
2. The chunk's primary time window and overlap margins

YOUR RESPONSIBILITIES:
1. MERGE the new actions into the running log. Deduplicate any actions from overlap zones that were already logged in a previous chunk.
2. VALIDATE continuity: timestamps must be strictly ascending. UI state references must be consistent (e.g., if chunk 2 says "the dialog from 02:45 is still open", verify chunk 1 logged that dialog opening).
3. RESOLVE conflicts: if overlap zones produce slightly different descriptions of the same event, keep the version from whichever chunk had it in its PRIMARY window (not overlap).
4. ANNOTATE section boundaries: insert a separator event of type "chunk_boundary" at each transition showing which chunk covered which time range.
5. TRACK running state: maintain awareness of what windows/panels/dialogs are currently open, what file is being edited, what tool is selected, etc. This helps future chunks understand context.

RESPOND with a JSON object:
{
  "chunk_processed": { "number": N, "primary_window": "MM:SS–MM:SS" },
  "new_actions_added": <count>,
  "duplicates_removed": <count>,
  "conflicts_resolved": [<descriptions if any>],
  "current_ui_state": {
    "application": "name of the software",
    "active_file": "filename or null",
    "visible_panels": ["list of open panels"],
    "active_tool": "currently selected tool or null",
    "open_dialogs": ["list of open dialogs or empty"],
    "other_state": "any other relevant persistent state"
  },
  "cumulative_action_count": <total actions so far>,
  "merged_log_excerpt": <last 10 actions from the merged log, for verification>
}

```
  
  
### UI Requirements  
  
**Main screen:**  
- YouTube URL input field + "Load Video" button  
- Video duration input (MM:SS) — or auto-detect if possible  
- Chunk size slider (3–7 min, default 5)  
- Overlap slider (30–90 sec, default 60)  
- Computed chunk plan display: shows all time windows that will be processed, with status indicators (pending/processing/done/error)  
- "Start Analysis" button → begins sequential chunk processing  
- "Pause / Resume" button to halt between chunks  
  
**Progress panel:**  
- Current chunk indicator with progress animation  
- Running count: total actions extracted, chunks completed / total  
- Elapsed time, estimated time remaining  
- Token usage tracker (cumulative)  
  
**Results panel (live-updating):**  
- Scrollable timeline view of all extracted actions  
- Each action shows: timestamp, action type badge (color-coded), actor, target element, detail text, confidence indicator  
- Filter controls: filter by action_type, actor, confidence level, time range  
- Search box for full-text search across all action details  
- Chunk boundary markers visible in the timeline  
  
**Export:**  
- "Download Full JSON" — exports the complete merged action log  
- "Download CSV" — flattened version for spreadsheet analysis  
- "Download Markdown" — human-readable formatted report  
  
**Session management:**  
- Display the Interactions API chain ID for the current session  
- "Save Session" stores the chain ID + video URL + progress to localStorage so users can return later (chains persist 55 days on paid tier)  
- "Resume Session" restores from a saved session and continues from the last completed chunk  
  
### Backend implementation details  
  
```
// Setup — TWO clients for the two API surfaces
import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({});    // for generateContent (video clipping)
const client = new GoogleGenAI({}); // for Interactions API (stateful chain)

// Phase A: Analyze one chunk with clipping
async function analyzeChunk(videoUrl, startSec, endSec, primaryStartSec, primaryEndSec, overlapSec) {
  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: [{
      role: 'user',
      parts: [
        {
          fileData: {
            fileUri: videoUrl,
            mimeType: 'video/*',
          },
          videoMetadata: {
            startOffset: `${startSec}s`,
            endOffset: `${endSec}s`,
          }
        },
        { text: `Analyze this video segment. ${PHASE_A_SYSTEM_PROMPT_WITH_FILLED_WINDOWS}` }
      ]
    }],
    config: {
      thinkingConfig: { thinkingLevel: 'HIGH' },
      mediaResolution: 'MEDIA_RESOLUTION_HIGH',  // need detail for UI element identification
    }
  });
  return JSON.parse(response.candidates[0].content.parts.find(p => p.text)?.text);
}

// Phase B: Feed into stateful session
async function accumulateChunk(chunkActions, chunkNumber, primaryWindow, previousInteractionId) {
  const interaction = await client.interactions.create({
    model: 'gemini-3-pro-preview',
    system_instruction: PHASE_B_SYSTEM_PROMPT,
    input: JSON.stringify({
      chunk_number: chunkNumber,
      primary_window: primaryWindow,
      extracted_actions: chunkActions
    }),
    previous_interaction_id: previousInteractionId || undefined,
    generation_config: { thinking_level: 'high' },
  });
  return {
    interactionId: interaction.id,
    result: JSON.parse(interaction.outputs[interaction.outputs.length - 1].text),
  };
}

// Main processing loop
async function processVideo(videoUrl, durationSec, chunkSizeSec, overlapSec) {
  const chunks = computeChunkWindows(durationSec, chunkSizeSec, overlapSec);
  let previousInteractionId = null;
  const allResults = [];

  for (const [i, chunk] of chunks.entries()) {
    // Phase A: clip and analyze
    const actions = await analyzeChunk(
      videoUrl,
      chunk.clipStart, chunk.clipEnd,
      chunk.primaryStart, chunk.primaryEnd,
      overlapSec
    );

    // Phase B: accumulate into session
    const { interactionId, result } = await accumulateChunk(
      actions, i + 1,
      `${formatTime(chunk.primaryStart)}–${formatTime(chunk.primaryEnd)}`,
      previousInteractionId
    );

    previousInteractionId = interactionId;
    allResults.push(result);

    // Progressive save: emit results to frontend after each chunk
    emitProgress(i + 1, chunks.length, result);
  }

  return allResults;
}

```
  
  
### Error handling  
  
- If a ==generateContent()== call fails (rate limit, safety filter, transient error), retry up to 3 times with exponential backoff.  
- If a chunk's JSON parse fails (model returned malformed JSON), retry the Phase A call with an additional instruction: "You MUST respond with valid JSON only. No markdown fences, no commentary."  
- If the Interactions API returns an error, log it and allow the user to retry from the last successful chunk (using the saved ==previous_interaction_id==).  
- Handle YouTube videos that are unavailable, private, or age-restricted with clear error messages.  
  
### Important implementation notes  
  
- The ==generateContent()== API uses **camelCase** field names (==thinkingConfig==, ==mediaResolution==). The Interactions API uses **snake_case** (==thinking_level==, ==media_resolution==). Do NOT mix them.  
- For ==generateContent()== config, use the nested structure: ==config: { thinkingConfig: { thinkingLevel: 'HIGH' } }==  
- For Interactions API config, use flat structure: ==generation_config: { thinking_level: 'high' }==  
- Video token cost at high resolution is ~258 tokens/frame at 1 FPS + ~32 tokens/sec audio. A 5-minute clip ≈ ~87,000 video tokens. Budget accordingly.  
- Set ==media_resolution: 'media_resolution_high'== (Interactions) / ==mediaResolution: 'MEDIA_RESOLUTION_HIGH'== (generateContent) because we need to read small UI text and icons.  
⸻  
