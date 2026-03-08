
# PROGRESS & SYSTEM DOCUMENTATION: Tutorial Dissector

**VERSION:** 2.0.0 (God-Tier Execution Graph Integration)
**LAST UPDATED:** Current Session

## 1. PROJECT STATUS: FEATURE COMPLETE
The core architecture for the **Verifiable Execution Graph** is fully implemented and operational. The app successfully transitions unstructured video into structured JSON and runnable Playwright code.

### 🟢 Completed Features Matrix
| Feature | Status | Technical Details |
| :--- | :---: | :--- |
| **Video Chunking** | ✅ | Implemented in `timeUtils.ts` with `clipStart/clipEnd` overlap windows. |
| **Stateful Phase B Memory** | ✅ | Multi-turn chat context successfully deduplicates actions across chunk boundaries. |
| **Spatial Grounding** | ✅ | Gemini successfully extracts `[ymin, xmin, ymax, xmax]` normalized to 1000px. |
| **Strict Input Modeling** | ✅ | Keystrokes (`['Ctrl', 'P']`) and typed strings extracted to distinct fields. |
| **BDD Intent Mapping** | ✅ | Pass 2 links `NarrativeStep` (Given/Then) to `ActionItem` (Mechanics) via foreign keys. |
| **Automation Compiler** | ✅ | `downloadPlaywright()` traverses the graph, mapping bounding boxes to Cartesian `(x, y)` centers. |
| **Error Path Filtering** | ✅ | Compiler strictly filters out actions flagged as `is_error_recovery`. |
| **Session Persistence** | ✅ | State autosaved to `IndexedDB` via `services/storage.ts`. |
| **Video Synchronization** | ✅ | Two-way sync between ReactPlayer and ResultsTimeline with auto-scrolling and active state highlighting. |

---

## 2. TECHNICAL DEBT & KNOWN LIMITATIONS (For Future Agents)

If you are a coding agent tasked with upgrading this application, pay attention to these known issues:

### ⚠️ A. YouTube CORS / Direct File Limitations
*   **Issue:** Currently, `@google/genai`'s `fileData.fileUri` expects a raw video file URL or a supported Google Cloud Storage URI. Passing standard `youtube.com/watch?v=` links directly into `fileUri` often fails unless the backend proxies it to a raw `.mp4` stream.
*   **Workaround Implemented:** The UI assumes the user provides a direct raw URL or relies on Gemini's internal capability to resolve specific YouTube links. The backend now uses `fetchYouTubeDuration()` to auto-scrape the HTML for the video length, removing the need for manual duration input (which is now just a fallback). Note that this HTML-scraping approach is fragile, as it sends a browser `User-Agent` header that can be blocked by YouTube's bot-detection at any time.
*   **Future Fix:** Implement a lightweight Node.js/Python backend proxy using `yt-dlp` to fetch the true video length and provide a direct `.mp4` stream to the frontend.

### ⚠️ B. Float Handling in Spatial Coordinates
*   **Issue:** Gemini occasionally ignores instructions to return pure integers for the `spatial_bounding_box` and returns floats (e.g., `15.5`). 
*   **Workaround Implemented:** The schema in `geminiService.ts` was updated from `z.number().int()` to `z.number()` to prevent strict JSON schema validation from crashing the request.
*   **Future Fix:** The Playwright compiler currently uses `Math.round()` to fix this. Keep this in mind if building new exporters (like Selenium or Puppeteer).

### ⚠️ C. Token Cost & Context Window Limits
*   **Issue:** The "Chat History" array in Phase B grows continuously. For a 30-minute video, the accumulated JSON context injected into the Phase B prompt becomes massive, potentially hitting output/input token limits.
*   **Workaround Implemented:** Implemented a "sliding window" for the Phase B chat history (keeps only the last 3 turns) instead of the entire array.

### ⚠️ D. Local Storage Quotas
*   **Issue:** Browsers limit `localStorage` to ~5MB. Storing massive arrays of detailed ActionItems and chat history strings will eventually crash the storage service (`QuotaExceededError`).
*   **Workaround Implemented:** Migrated `storage.ts` to use `IndexedDB` (via `idb-keyval`) to allow for gigabytes of local project storage.
