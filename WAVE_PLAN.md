# Tutorial Dissector — Implementation Waves

Three waves. Each wave is a self-contained prompt for an LLM coding agent.

---

## Wave 1: Prompt Engineering (Changes 1, 2, 3, 7)

All changes are in `constants.ts`. No logic changes, no new files, no dependencies.

### Agent prompt

You are modifying the Gemini extraction prompts in `constants.ts` for Tutorial Dissector. The goal is to tell Gemini WHY it's extracting this data and to tighten naming and location description quality. All changes are in `constants.ts` only.

**CONTEXT:** This extraction feeds a downstream pipeline that builds a canonical registry of UI elements and workflow states, then uses automated agents to locate these elements in live browser DOM, and finally reimplements the workflows natively in a different platform. Gemini currently has no idea about this purpose, which causes it to use narrator paraphrases instead of on-screen labels and produce vague location descriptions.

**CHANGE A — Add purpose preamble to PHASE_A_SYSTEM_PROMPT:**
Insert this block at the very top of the prompt, BEFORE the "ANALYSIS WINDOW:" section:

> PURPOSE: This extraction feeds a downstream pipeline that will:
> 1. Build a canonical registry of every UI element, state, and workflow step in this software
> 2. Use an automated agent to locate these exact elements in the live application's DOM
> 3. Reimplement the workflows natively in a different platform
>
> This means:
> - target.element MUST use the EXACT text visible on screen (button labels, menu item text, field placeholders) — not the narrator's paraphrase. If the narrator says "template settings" but the menu reads "Manage block templates", use "Manage block templates".
> - target.location MUST describe WHERE the element sits using a structural, container-relative path that another agent can follow to find it: "{containing panel or modal} → {region within container} → {nearby landmark element} → {relative position} → {target}". Example: "Manage block templates modal → header actions row → right of Search field → Create block template button". Do NOT use vague descriptions like "near the top" or "on the right side".
> - target.panel MUST name the specific panel, modal, dialog, or toolbar — not "main screen" or "the interface".
> - State transitions matter. When an action opens a modal, closes a dialog, enables a toggle, or changes a dropdown value, the result field must clearly state the new state.
> - If the narrator uses a different term than what's on screen, capture the narrator's term in context_note, not in target.element.

**CHANGE B — Add two new rules to the RULES FOR ACTIONS section in PHASE_A_SYSTEM_PROMPT:**
Append these after the existing rules (currently ending at rule 8):

> 9. NAMING PRECISION: For target.element, always use the EXACT label visible on the UI element. Read button text, menu item text, field labels, tab names, and dialog titles literally from the screen. Common mistakes to avoid:
>    - Using the narrator's casual name instead of the on-screen label
>    - Describing what an element does instead of what it says ("settings button" when it reads "Preferences")
>    - Using generic names ("the dropdown", "the button") when the element has visible text
>    If the narrator calls it something different from what's on screen, put the narrator's term in context_note.
> 10. LOCATION STRUCTURE: For target.location, describe the element's position as a navigable path from the outermost container inward:
>    "{panel or modal name} → {region or section} → {nearest labeled sibling or landmark} → {relative position} → {element}"
>    Good: "Episode Action Menu dropdown → middle of list → below 'Print' → Manage block templates"
>    Bad: "In the menu" or "Top right area"
>    This path will be used by an automated agent to find this element in the live DOM.

**CHANGE C — Demote bounding box requirement in PHASE_A_SYSTEM_PROMPT:**
Find rule 3 which currently says: "SPATIAL GROUNDING: For EVERY target element, you MUST provide its normalized 2D bounding box..."
Replace the ENTIRE rule 3 with:

> 3. SPATIAL GROUNDING: If you can confidently identify the target element's bounding box on screen, provide it as spatial_bounding_box: [ymin, xmin, ymax, xmax] normalized 0-1000. However, the structured location path (rule 10) is the primary spatial signal — bounding boxes are optional supplementary data. Do not estimate or hallucinate coordinates. If uncertain, omit the field.

**CHANGE E — Update OUTPUT FORMAT schema example in PHASE_A_SYSTEM_PROMPT:**
The schema example in the OUTPUT FORMAT section currently uses generic placeholders that undermine the naming and location rules. Update the `target` object example to demonstrate the expected quality:

Replace:
```json
"target": {
  "element": "descriptive name",
  "location": "spatial position",
  "panel": "which panel",
  "visual": "visual state",
  "spatial_bounding_box": [150, 200, 180, 400]
}
```

With:
```json
"target": {
  "element": "Create block template",
  "location": "Manage block templates modal → header actions row → right of Search field → Create block template button",
  "panel": "Manage block templates modal",
  "visual": "enabled, blue primary button",
  "spatial_bounding_box": [150, 200, 180, 400]  // optional — omit if uncertain (see rule 3)
}
```

LLMs follow schema examples more closely than prose rules. This single change reinforces rules 9-10 at the point where the model is learning the output shape.

**CHANGE D — Replace the CRITICAL OBJECTIVE block in PASS_2_SYSTEM_PROMPT:**
Find the existing "CRITICAL OBJECTIVE:" block (starts with "The narrative blocks MUST complement...") and replace the ENTIRE block with:

> CRITICAL OBJECTIVE:
> This narrative track feeds a downstream pipeline that reimplements the tutorial's workflow in a different platform. Your narrative steps must capture:
> 1. The INTENT behind each action sequence — why the operator is doing this, not just what they clicked
> 2. PRECONDITIONS and POSTCONDITIONS — your existing BDD constraints (rule 3) serve this purpose; ensure they describe concrete UI state (which modal is open, what was previously configured), not abstract summaries
> 3. Warnings, constraints, and mutual exclusions the narrator mentions — these become safety rules in the reimplementation. Examples: "this setting is incompatible with X", "you must do A before B", "changing this will reset Y"
> 4. Cross-step data dependencies — if step 3 uses a value produced by step 1 (e.g., a template name, a saved preset, a configured field), make this dependency explicit in the precondition. The reimplementation agent needs to know which steps feed into which.
>
> A developer reading your narrative alongside the execution graph must be able to reimplement this workflow WITHOUT watching the video. Capture the "why" and the dependencies, not a transcript.

**IMPORTANT:**
- Do NOT touch any other files
- Do NOT change the schema objects in `geminiService.ts`
- Do NOT modify `PHASE_B_SYSTEM_PROMPT` or `GLOBAL_DEDUPLICATION_PROMPT`
- Preserve all existing rules in `PHASE_A_SYSTEM_PROMPT` that are not being replaced (rules 1-2, 4-8)
- Preserve all existing rules in `PASS_2_SYSTEM_PROMPT` that are not being replaced

### Test

Run extraction on 3 tutorials (1 Cuez, 1 Flowics, 1 other). Compare against v10 baseline:
* Are target.element values closer to on-screen text?
* Do target.location values follow the container-relative path pattern?
* Are preconditions/postconditions more explicit about state dependencies?
* Any regressions in action completeness or linking coverage?

---

## Wave 2: Export Enrichment (Changes 4, 5, 8)

Adds viewport metadata, screenshot capture, and optional ID preservation. Touches `server/jobManager.ts`, `components/ResultsTimeline.tsx`, `utils/jsonOptimize.ts`, and creates one new file.

### Agent prompt

You are adding visual ground truth capabilities to Tutorial Dissector's export pipeline. Three changes: viewport metadata, per-action screenshot capture, and ID preservation in the cleaned export.

**CONTEXT:** The downstream pipeline uses an automated Playwright agent to find UI elements in live browser applications. It needs: (a) the original video's viewport resolution to size its browser, (b) per-action screenshots as visual reference for element grounding, and (c) preserved action/step IDs in the cleaned export for relational linking.

**CHANGE A — Add viewportResolution to metadata:**

First, add a resolution detection utility. In `utils/screenshotCapture.ts` (or a separate `utils/videoMeta.ts`), add:

```typescript
import { execSync } from 'child_process';

/**
 * Detects video resolution via ffprobe. Falls back to 1920×1080 if ffprobe
 * is unavailable or the video path doesn't exist (e.g., YouTube URL only).
 */
export function detectViewportResolution(
  videoPath: string | null
): { width: number; height: number } {
  const DEFAULT = { width: 1920, height: 1080 };
  if (!videoPath) return DEFAULT;
  try {
    const raw = execSync(
      `ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of json "${videoPath}"`,
      { stdio: 'pipe', timeout: 10000 }
    ).toString();
    const { streams } = JSON.parse(raw);
    if (streams?.[0]?.width && streams?.[0]?.height) {
      return { width: streams[0].width, height: streams[0].height };
    }
  } catch { /* ffprobe not available or video not local */ }
  return DEFAULT;
}
```

Then, in `server/jobManager.ts`, find the metadata object construction in the cleaned output section (search for the object that contains `videoUrl`, `duration`, `total_actions`, `total_steps`, `total_annotations`, `deduplicated`). Add this field:

```
viewportResolution: detectViewportResolution(localVideoPath)
```

In `components/ResultsTimeline.tsx`, find the `downloadJSON` function's metadata object (contains `total_steps`, `total_actions`, `total_annotations`, `learned_context`). Since the client-side export doesn't have access to ffprobe, hardcode the default here:

```
viewportResolution: { width: 1920, height: 1080 }
```

The server-side export gets the real resolution; the client-side export uses a default. A future improvement can pass the detected resolution from the server to the client.

**CHANGE B — Add screenshot capture:**

Create a new file: `utils/screenshotCapture.ts`

```typescript
import { execSync } from 'child_process';
import type { ActionItem } from '../types';
import { parseMMSS } from './timeUtils';

/**
 * Captures one video frame per unique action timestamp.
 * Returns a map of action ID → screenshot filename.
 * Non-fatal: failures are logged but don't block the pipeline.
 */
export function captureActionScreenshots(
  videoPath: string,
  actions: ActionItem[],
  outputDir: string
): Map<string, string> {
  const refs = new Map<string, string>();

  // Group actions by timestamp (multiple actions may share a second)
  const byTimestamp = new Map<string, string[]>();
  for (const action of actions) {
    if (!byTimestamp.has(action.timestamp)) byTimestamp.set(action.timestamp, []);
    byTimestamp.get(action.timestamp)!.push(action.id);
  }

  for (const [timestamp, actionIds] of byTimestamp) {
    const seconds = parseMMSS(timestamp);
    const filename = `frame-${String(seconds).padStart(5, '0')}.png`; // Use seconds for unique, collision-free filenames
    const outputPath = `${outputDir}/${filename}`;

    try {
      execSync(
        `ffmpeg -ss ${seconds} -i "${videoPath}" -vframes 1 -q:v 2 "${outputPath}" -y`,
        { stdio: 'pipe', timeout: 15000 }
      );
      for (const id of actionIds) {
        refs.set(id, filename);
      }
    } catch (e: any) {
      console.warn(`Screenshot capture failed at ${timestamp}: ${e.message}`);
    }
  }

  return refs;
}
```

This utility is called after extraction completes. Integration into the pipeline (when to call it, where to store frames, how to attach `screenshotRef` to the graph export) should be wired in `jobManager.ts` after Phase D completes, but the exact integration point depends on whether you want server-side capture or a separate CLI step. For now, export the utility and document its usage.

**CHANGE C — Preserve IDs in cleaned export:**

In `utils/jsonOptimize.ts`, in the `cleanFinalOutput` function:

Find and REMOVE these five lines:
```
delete cleanedAction.id;         // line 169 — strips inlined action cross-reference ID
delete stepCopy.linked_visual_action_ids;  // line 179 — strips action link array
delete cleanedAnn.id;            // line 190 — strips inlined annotation cross-reference ID
delete stepCopy.linked_annotation_ids;     // line 195 — strips annotation link array
delete stepCopy.id;              // line 197 — strips step ID
```

This makes the cleaned export usable for relational linking while keeping all other cleaning (metadata stripping, `interacted_components` compaction, empty field removal).

Run the existing `jsonOptimize` tests after this change — they test for ID stripping, so those specific assertions need to be UPDATED (not deleted) to expect IDs to be present.

**IMPORTANT:**
* The screenshot utility file is standalone — it does not need to be wired into the automatic pipeline yet
* `ffmpeg` must be available on the system PATH for screenshot capture
* The cleaned export ID preservation is backward-compatible — downstream consumers that ignore IDs are unaffected
* Update test expectations in `utils/jsonOptimize.test.ts` to match the new behavior (IDs preserved, annotation IDs preserved, link arrays preserved)

### Test

- Verify `viewportResolution` appears in both graph and cleaned exports
- Run `screenshotCapture` manually on one downloaded tutorial video, verify PNG files are created at correct timestamps
- Run `jsonOptimize` test suite — update ID-stripping assertions (for actions, steps, and annotations), verify all other tests pass
- Verify cleaned export now contains `id` fields on actions, steps, and annotations, and `linked_visual_action_ids` and `linked_annotation_ids` on steps

---

## Wave 3: Vocabulary Feedback Loop (Change 6)

Depends on the downstream pipeline's Phase 3 (first reconciliation pass) producing `glossary/elements.json`. Implement after the downstream glossary exists.

### Agent prompt

You are adding a vocabulary feedback loop to Tutorial Dissector. When a canonical glossary of UI element names exists from a previous extraction + reconciliation cycle, those names should be fed back into subsequent extractions as soft guidance.

**CONTEXT:** The downstream pipeline produces `glossary/elements.json` — a software-namespaced JSON file mapping canonical element names. When re-extracting tutorials for the same software, feeding these names into the Gemini prompt biases extraction toward consistent naming without enforcing it. Gemini still extracts what it sees; the vocabulary list just makes it more likely to use the established canonical name when it matches.

**EXPECTED GLOSSARY SCHEMA:** The `elements.json` file is structured as a top-level object keyed by software name, with nested categories containing element entries that have a `canonical` field:

```json
{
  "Cuez": {
    "buttons": {
      "create_template": { "canonical": "Create block template", "aliases": ["new template"] },
      "manage_templates": { "canonical": "Manage block templates", "aliases": ["template settings"] }
    },
    "panels": {
      "episode_menu": { "canonical": "Episode Action Menu", "aliases": ["episode dropdown"] }
    },
    "_meta": { "version": 1, "updated": "2026-03-14" }
  }
}
```

The `walk()` function below traverses this structure collecting all `canonical` values. If the downstream glossary schema changes, update `walk()` accordingly — the current implementation is intentionally simple and relies on the `canonical` key convention.

**CHANGE — Create `utils/extractionVocabulary.ts`:**

```typescript
import { readFileSync, existsSync } from 'fs';

/**
 * Generates a vocabulary hint string from the canonical glossary for a given software.
 * Returns empty string if no glossary exists for that software.
 * Intended to be passed as customContext to analyzeChunkPhaseA.
 */
export function generateExtractionVocabulary(
  glossaryPath: string,
  software: string
): string {
  if (!existsSync(glossaryPath)) return '';

  const elements = JSON.parse(readFileSync(glossaryPath, 'utf-8'));
  const softwareElements = elements[software];
  if (!softwareElements) return '';

  const names: string[] = [];
  function walk(obj: any) {
    if (obj && typeof obj === 'object') {
      if (obj.canonical && typeof obj.canonical === 'string') {
        names.push(obj.canonical);
      }
      for (const [key, value] of Object.entries(obj)) {
        if (key !== '_meta' && typeof value === 'object' && value !== null) {
          walk(value);
        }
      }
    }
  }
  walk(softwareElements);

  if (names.length === 0) return '';

  return [
    `KNOWN UI ELEMENTS FOR ${software.toUpperCase()}:`,
    `The following element names have been verified in previous extractions. When you see these elements on screen, use these exact names in target.element:`,
    ...names.map(n => `- ${n}`),
    ``,
    `These are not exhaustive — if you see elements not on this list, name them using the exact on-screen label text.`
  ].join('\n');
}
```

**USAGE:** In the extraction orchestration code (`server/jobManager.ts` or wherever `customContext` is assembled before calling `analyzeChunkPhaseA`), prepend or append the vocabulary string to the existing `customContext`:

```typescript
import { generateExtractionVocabulary } from '../utils/extractionVocabulary';

// Before the extraction loop:
const vocabulary = generateExtractionVocabulary('glossary/elements.json', softwareName);
const fullContext = [existingCustomContext, vocabulary].filter(Boolean).join('\n\n');
// Pass fullContext as the customContext parameter
```

**IMPORTANT:**
* This is SOFT GUIDANCE, not enforcement. The prompt text explicitly says "if you see elements not on this list, name them using the exact on-screen label text"
* If no glossary exists yet (first extraction), the function returns empty string and nothing changes
* The glossary path should be configurable, not hardcoded — the downstream pipeline may store it anywhere
* Do not modify the Gemini prompts in `constants.ts` for this change — the existing CUSTOM APP CONTEXT injection handles it

### Test

- Unit test: call `generateExtractionVocabulary` with a sample `elements.json`, verify output format
- Unit test: call with nonexistent file, verify empty string
- Unit test: call with file that has no matching software key, verify empty string
- Integration: manually prepend the output to a `customContext` string and verify it appears in the Gemini prompt during extraction

---

## Execution order

```
Wave 1 (prompt changes) → test on 3 tutorials → review quality delta
  ↓
Wave 2 (export enrichment) → test exports + screenshots → verify backward compat
  ↓
[Downstream Phase 3: build glossary]
  ↓
Wave 3 (vocabulary feedback) → re-extract one tutorial → compare naming consistency
```

Wave 1 and Wave 2 can run in parallel if needed — they touch different files (`constants.ts` vs `jobManager`/`jsonOptimize`/new file). Wave 3 is sequentially dependent on the downstream glossary existing.

**Testing isolation:** If running Wave 1 and Wave 2 in parallel, test them against the same baseline extraction (pre-Wave-1 output). This isolates prompt quality changes (Wave 1) from export format changes (Wave 2). After both are merged, run a combined end-to-end test to verify they compose correctly.
