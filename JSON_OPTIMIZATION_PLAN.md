# Plan: Integrate JSON Optimization Into Pipeline

## Context

The Tutorial Dissector pipeline passes large JSON payloads between its four phases via LLM prompts. Currently, `JSON.stringify(obj, null, 2)` is used for all prompt-injected payloads, wasting ~15-25% of tokens on whitespace alone. Fields like `confidence`, `spatial_bounding_box`, and null/empty values add further noise without informing the model's reasoning.

The user built a standalone Python script (`tutorial_analyze.py`) that cleans and denormalizes the final output JSON — stripping extraction metadata, removing empty fields, compacting interacted_components, and inlining actions into narrative steps. This plan ports those optimizations into the TypeScript pipeline itself, applied at each phase boundary where JSON is injected into prompts, and as a post-pipeline cleaning step for export.

### Key Safety Factors

1. **Zod-enforced output schemas.** All four phases use `responseSchema` with Zod-derived JSON schemas via Gemini's structured output mode. The LLM *cannot* omit required fields or drift on output structure regardless of what it sees in input. This eliminates "schema drift" risk from aggressive input stripping. The remaining risks are purely about *reasoning quality* (does the model make correct decisions with less input context?), not output format.

2. **Zipper pattern already established.** Phases B and D already strip `ui_context` before sending to the LLM and re-attach it afterward using cascading content-similarity fallback. All stripping operates on copies made for prompt injection, never on the authoritative `state.actions` data. The proposed optimizations follow this same pattern.

3. **AutomationCompiler dependency.** The Allium spec defines an `AutomationCompiler` surface (line 359-374 of `tutorial-dissector.allium.md`) that filters `golden_path_actions = project.actions where is_error_recovery != true`. The `downloadPlaywright()` function in `ResultsTimeline.tsx` (line 150) implements this: `.filter((a): a is ActionItem => !!a && !a.is_error_recovery)`. This means:
   - `is_error_recovery` must remain on stored actions (both `true` and `false` values) for the filter to work correctly.
   - Stripping `is_error_recovery: false` is safe for **prompt copies only** — the flag-by-presence pattern where only `true` appears in LLM input.
   - The cleaned/denormalized export must either preserve this field or be clearly labeled as "not for automation compilation."

4. **Phase C receives video + audio.** Unlike Phases B and D (which are text-only LLM calls), Phase C sends the actual video file to Gemini alongside the text prompt. The text context (simplified actions, previous steps, annotations) serves as a structured reference that the model cross-references against what it sees/hears. Overly aggressive trimming of this reference data could degrade the model's ability to correctly link narration to the right actions.

5. **Phase D's naming consistency task.** The global dedup prompt explicitly asks the model to ensure "UI elements, panels, and tools are named consistently throughout the entire log." This requires the model to compare `interacted_components` across actions in structured form. Pipe-delimited compaction would impair this reasoning.

---

## Step 1: Create `utils/jsonOptimize.ts`

New utility module with all cleaning/compaction functions, centralized and testable.

### Functions

#### `compactStringify(obj: unknown, indent: number = 1): string`
- Replaces `JSON.stringify(obj, null, 2)` for all LLM-bound payloads.
- Default `indent: 1` saves ~50% of whitespace tokens vs `indent: 2` while preserving structural readability for the model's input parsing.
- `indent: 0` (fully compact) is not recommended for Phase D where 200+ actions must be parsed — the model needs nesting cues to track array boundaries.

#### `stripEmptyAndDefaults(obj: Record<string, any>): Record<string, any>`
- Removes keys where value is `null`, `undefined`, `""`, `[]`, or `{}`.
- Removes `is_error_recovery: false` from prompt copies (flag-by-presence — only appears when `true`).
- One level of nested dict cleaning (for `target`, `input_data`).
- **Safe because:** Zod schema enforces output shape. Input field absence cannot cause output omission.
- Ported from Python `_strip_empty_fields` + `DEFAULT_VALUES`.

#### `stripExtractionMeta(action: any): any`
- Removes: `confidence`, `chunkIndex`, and `target.spatial_bounding_box`.
- `confidence` — Phase B/D dedup prompts don't reference it. The dedup rule says "keep the one with the most detailed target and interacted_components." Zod forces `confidence` in output regardless.
- `spatial_bounding_box` — pixel coordinates never referenced by any downstream phase's system prompt. Actions are matched by timestamp + action_type + detail, not spatial position. Two actions at the same timestamp targeting different screen regions are disambiguated by `target.element` + `target.panel`.
- `chunkIndex` — pipeline tracking metadata, not instructional content.

#### `cleanForPrompt(action: any): any`
- Combines `stripExtractionMeta` + `stripEmptyAndDefaults` in one call.
- Does **NOT** compact `interacted_components` — keeps structured objects for Phase D's naming consistency reasoning.

#### `cleanFinalOutput(data: {actions, annotations, narrativeSteps, learnedContext?, metadata?}): object`
- TypeScript port of the Python `clean_json()` denormalization.
- **Denormalization:** Inlines each step's linked actions and annotations directly into the step object, eliminating cross-reference lookups.
- **Strips:** Cross-reference IDs (`id` on inlined actions/annotations, `linked_*_ids` on steps), extraction metadata (`confidence`, `chunkIndex`, `spatial_bounding_box`), empty/null/default fields.
- **Compacts:** `interacted_components` from objects to pipe-delimited strings (`"type|label[|state]"`). Safe here because this output is for human/LLM tutorial-writing consumption, not for pipeline reasoning or automation compilation.
- **Preserves:** Unlinked actions/annotations in separate top-level arrays for review (indicates extraction gaps or broken ID links).
- Returns `{ result: { metadata, steps, unlinked_actions?, unlinked_annotations? }, serializedSize: number }`. The `serializedSize` is computed once during denormalization (the function internally serializes to measure size), avoiding redundant `JSON.stringify` calls at the logging callsite.
- **Important:** This output is NOT suitable for the AutomationCompiler (Playwright export) because: (a) it strips `is_error_recovery` on false-valued actions, which the compiler needs to filter on; (b) it strips `spatial_bounding_box`, which the Playwright compiler uses for coordinate-based clicks; (c) it removes cross-reference IDs, making relational queries impossible. It must be offered as a separate export alongside the raw relational format.

#### `extractSkeleton(cleanedData: object): object`
- Strips `actions` from each step in already-cleaned output.
- Returns the lightweight planning layer (~15-25% of full cleaned size).
- Useful for outlining tutorial structure, planning sections, and identifying redundancies without the bulk of visual action data.
- **Integration:** Exposed as a third export option in Step 5c ("Export Skeleton"). Not called internally by the pipeline — this is a user-facing export utility only, alongside "Export Raw" and "Export Cleaned."

#### `detectUnlinkedActions(steps: NarrativeStep[], actions: ActionItem[]): object`
- Port of Python `detect_unlinked_actions` with cross-chunk linking failure diagnosis.
- Goes beyond listing orphan IDs — detects contiguous clusters of orphan actions co-occurring with empty narrative steps, which is the telltale sign of cross-chunk ID linking failure.
- Returns `{ unlinked_count, unlinked_ids, empty_steps, likely_linking_failure, diagnosis? }`.

#### `detectRedundantSteps(steps: NarrativeStep[]): {index: number, duplicateOf: number}[]`
- Port of Python `detect_redundancy` — flags narrative steps with high topic/intent overlap using Jaccard similarity on non-stopword tokens.
- Threshold: `topic_overlap >= 0.6 OR intent_overlap >= 0.6 OR (both >= 0.3)`.
- **Edge case:** If either token set is empty after stopword removal (e.g., intent is all stopwords, or topics array is empty), treat Jaccard similarity as `0.0` for that comparison — no redundancy signal from empty data.

---

## Step 2: Integrate into Phase B input

**File:** `services/geminiService.ts` ~line 342-353

**Current code:**
```typescript
// Strip ui_context to save tokens in Phase B (and in chat history)
const simplifiedChunkActions = chunkActions.map(a => {
  const { ui_context, ...rest } = a;
  return rest;
});

const message = JSON.stringify({
  chunk_number: chunkNumber,
  primary_window: primaryWindow,
  extracted_actions: simplifiedChunkActions,
  extracted_annotations: chunkAnnotations
});
```

**Changes:**

At the **top of the file** (module-level imports), add:
```typescript
import { cleanForPrompt, stripEmptyAndDefaults, compactStringify } from '../utils/jsonOptimize';
```

Then replace the **function body** at ~line 342-353:
```typescript
// Strip ui_context to save tokens in Phase B (and in chat history)
const simplifiedChunkActions = chunkActions.map(a => {
  const { ui_context, ...rest } = a;
  return cleanForPrompt(rest);
});

const message = compactStringify({
  chunk_number: chunkNumber,
  primary_window: primaryWindow,
  extracted_actions: simplifiedChunkActions,
  extracted_annotations: chunkAnnotations.map(stripEmptyAndDefaults)
});
```

**What's stripped:** `confidence`, `chunkIndex`, `spatial_bounding_box`, null/empty fields, `is_error_recovery: false` (from the prompt copy).

**What's preserved in stored data:** Everything — the zipper re-attachment at lines 428-449 reads from the original `chunkActions` map, unaffected by prompt compaction.

**Reasoning quality risk:** Low. Phase B's job is overlap deduplication — it matches by timestamp proximity and action_type. The stripped fields (`confidence`, bounding box) are not used for dedup matching. The Phase B system prompt never references these fields.

---

## Step 3: Integrate into Phase C input (highest impact)

**File:** `services/geminiService.ts` ~lines 514-540

### 3a. Clean the simplified actions

Current projection (lines 515-529) already reduces to `{id, timestamp, action, element, detail, is_error_recovery, state_change}`. Apply `stripEmptyAndDefaults` to remove null `state_change` and `is_error_recovery: false`:

```typescript
const simplifiedActions = relevantVisualActions.map(a => {
  const projected = {
    id: a.id,
    timestamp: a.timestamp,
    action: a.action_type,
    element: a.target?.element,
    detail: a.detail,
    is_error_recovery: a.is_error_recovery,
    state_change: a.interacted_components?.length
      ? a.interacted_components.map(c => {
          const entry: Record<string, string> = { label: c.label };
          if (c.state_before != null) entry.from = c.state_before;
          if (c.state_after != null) entry.to = c.state_after;
          return entry;
        })
      : undefined
  };
  return stripEmptyAndDefaults(projected);
});
```

**Token savings:** Actions without `state_change` or `is_error_recovery` drop from 7 fields to 5. With 30-50 actions per chunk, this saves ~200-400 tokens.

### 3b. Trim previous steps context

Current (lines 531-533): sends last 10 full step objects as `JSON.stringify(previousSteps, null, 2)`.

**What's expensive:** Each step's `linked_visual_action_ids` array contains 3-15 UUID strings (~10 tokens each with Gemini's tokenizer). With 10 previous steps averaging 8 linked IDs, that's 10 × 8 × 10 = ~800 tokens of UUID arrays, plus JSON structural overhead (brackets, commas, quotes) bringing it to ~900-1,000 tokens. These IDs serve no purpose in the continuity prompt — Phase C needs to know *what was already explained*, not *which action IDs were linked*.

**What must be preserved for continuity:**
- `explanation` — Without this, the model re-explains the same concepts because it only sees the intent (a short phrase like "Configure block properties") and can't tell what was already said.
- `postcondition` — Enables the BDD chain. The new step's precondition should flow from the prior step's postcondition.
- `insight_type` — Prevents consecutive steps of the same type (e.g., two `workflow_framing` steps back-to-back).
- `topics` — Prevents topic repetition.

**What's safe to drop:**
- `linked_visual_action_ids` — Bulk UUID arrays (~800-1,000 tokens including structural overhead). Not needed for continuity.
- `linked_annotation_ids` — Same reasoning.
- `precondition` — Derivable from the prior step's postcondition, which is preserved.
- `id` — The step IDs are generated fresh by jobManager.ts (line 430: `step.id = 'step_' + uuidv4().substring(0, 8)`), so previous step IDs have no downstream reference value in the Phase C prompt.

```typescript
const previousStepsContext = previousSteps.length > 0
  ? compactStringify(previousSteps.map(s => ({
      timestamp: s.timestamp,
      intent: s.intent,
      explanation: s.explanation,
      postcondition: s.postcondition,
      insight_type: s.insight_type,
      topics: s.topics
    })))
  : "This is the beginning of the video.";
```

**Token savings:** ~900-1,500 tokens per Phase C call (depending on number and link density of previous steps). Plus `indent: 2` → `indent: 1` whitespace reduction.

### 3c. Switch all replacements to compact stringify

```typescript
.replace('{previous_steps_context}', previousStepsContext)  // already compact from 3b
.replace('{visual_actions}', compactStringify(simplifiedActions))
.replace('{annotations}', compactStringify(relevantAnnotations.map(stripEmptyAndDefaults)))
```

**Reasoning quality risk:** Low-Medium. Phase C receives the video alongside this text. The simplified actions serve as a "what to look for" reference, not the sole information source. The model sees/hears the video and uses the text to match narration to specific action IDs. The ID (critical for linking), timestamp, action type, element, detail, and state_change (critical for accuracy per IMPLEMENTATION_PLAN step 2) are all preserved.

---

## Step 4: Integrate into Phase D input

**File:** `services/geminiService.ts` ~lines 674-698

### 4a. Clean simplified actions (keep structured components)

The existing projection at lines 680-693 already omits `ui_context` and `chunkIndex`. We further omit `confidence` and `spatial_bounding_box` directly in the projection (rather than including them only to have `cleanForPrompt` strip them), then apply `stripEmptyAndDefaults` for null/default removal:

```typescript
const simplifiedActions = actions.map(a => {
  const target = a.target ? { ...a.target } : undefined;
  if (target) delete target.spatial_bounding_box;  // not needed for dedup reasoning

  return stripEmptyAndDefaults({
    id: a.id,
    timestamp: a.timestamp,
    action_type: a.action_type,
    actor: a.actor,
    target,
    detail: a.detail,
    result: a.result,
    interacted_components: a.interacted_components,  // KEPT as structured objects
    input_data: a.input_data,
    is_error_recovery: a.is_error_recovery,
    context_note: a.context_note
    // confidence intentionally omitted — not referenced by dedup prompt, Zod forces it in output
  });
});
```

**Why `interacted_components` stays structured:** Phase D's prompt Rule 4 says "Ensure UI elements, panels, and tools are named consistently throughout the entire log." The model needs to compare `{type: "dropdown", label: "Block type"}` across actions. Pipe-delimited `"dropdown|Block type"` requires parsing a custom format before reasoning.

### 4b. Switch to compact stringify

```typescript
.replace('{all_actions}', compactStringify(simplifiedActions))
.replace('{narrative_context}', compactStringify(minifiedNarrative))
.replace('{final_ui_state}', compactStringify(finalUiState))
```

**Safety:** Zipper re-attachment (lines 746-768) uses the original `actions` map. Zod schema (`z.array(phaseBActionItemSchema)`) enforces output.

**Reasoning quality risk:** Low. Phase D's dedup decisions are based on timestamp proximity + action_type + detail similarity + narrative context. None of the stripped fields (`confidence`, `spatial_bounding_box`, `chunkIndex`, null fields) participate in these comparisons. The GLOBAL_DEDUPLICATION_PROMPT's Rule 5 ("normalize optional fields") already instructs the model to fill defaults — it's producing these fields from schema, not echoing them from input.

---

## Step 5: Post-pipeline cleaning for export

**File:** `server/jobManager.ts`

### 5a. Add `cleanedOutput` to job state

In the state initialization (around line 17 where other state fields are defined):

```typescript
cleanedOutput?: object;  // Denormalized, cleaned JSON for export
```

### 5b. After Phase D completes (after ~line 607, before line 609)

The `import` statement goes at the **top of the file** (module-level):
```typescript
import { cleanFinalOutput, detectUnlinkedActions, detectRedundantSteps } from '../utils/jsonOptimize';
```

Then in the function body, after the Phase D try/catch block:

**Important:** Phase D can fail gracefully (lines 604-607), in which case `state.actions` still contains pre-dedup data with potential duplicates. The `cleanFinalOutput` must flag this degraded state so the operator knows the cleaned export may contain duplicates.

**Concrete placement:** Declare `let phaseDSucceeded = false;` immediately before the existing Phase D try/catch block (before line 529: `try {`). Set `phaseDSucceeded = true;` at line 603, after link remapping completes — this is the last operation inside the try block, after both dedup (line 551) and narrative link remapping (line 602). This ensures the flag is only true when dedup AND remapping both succeeded. The `cleanFinalOutput` call goes after the Phase D try/catch block closes (after line 607), before line 609 (`state.progress = 100`):

```typescript
// Line ~528: declare before Phase D try/catch
let phaseDSucceeded = false;

try {
  // ... existing Phase D logic (lines 529-603) ...

  // Line ~603: set after link remapping completes (last operation in try block)
  phaseDSucceeded = true;
} catch (dedupError: any) {
  addLog('warn', `Global deduplication failed, falling back to chunked actions. Error: ${dedupError.message}`);
}

// Line ~608: generate cleaned output (after Phase D try/catch, before state.progress = 100)
try {
  const { result: cleaned, serializedSize } = cleanFinalOutput({
    actions: state.actions,
    annotations: state.annotations,
    narrativeSteps: cumulativeNarrative,
    learnedContext: state.learnedContext,
    metadata: {
      videoUrl: state.videoUrl,
      duration: state.duration,
      totalActions: state.actions.length,
      totalSteps: cumulativeNarrative.length,
      totalAnnotations: state.annotations.length,
      deduplicated: phaseDSucceeded  // false = pre-dedup data, may contain duplicates
    }
  });
  state.cleanedOutput = cleaned;
  if (!phaseDSucceeded) {
    addLog('warn', `Cleaned output generated from PRE-DEDUP data (Phase D failed). Export may contain duplicate actions.`);
  } else {
    addLog('info', `Cleaned output generated (${serializedSize} chars)`);
  }
} catch (cleanErr: any) {
  addLog('warn', `Failed to generate cleaned output: ${cleanErr.message}`);
}

// Enhanced diagnostics (port of Python analysis functions)
try {
  const unlinked = detectUnlinkedActions(cumulativeNarrative, state.actions);
  if (unlinked.likely_linking_failure) {
    addLog('warn', `Linking diagnosis: ${unlinked.diagnosis}`);
  } else if (unlinked.unlinked_count > 0) {
    addLog('info', `${unlinked.unlinked_count} visual actions not linked to any narrative step`);
  }

  const redundant = detectRedundantSteps(cumulativeNarrative);
  if (redundant.length > 0) {
    addLog('warn', `${redundant.length} potentially redundant narrative step(s) detected: ${
      redundant.map(r => `step ${r.index} ≈ step ${r.duplicateOf}`).join(', ')
    }`);
  }
} catch (diagErr: any) {
  // Diagnostics are non-critical — don't fail the pipeline
  addLog('info', `Diagnostic analysis skipped: ${diagErr.message}`);
}
```

### 5c. Update frontend export

**File:** `components/ResultsTimeline.tsx` ~lines 108-130

Add two new export functions alongside the existing `downloadJSON`. The existing button stays as "Export Raw JSON" (relational format, suitable for automation compilation and re-import):

```typescript
import { extractSkeleton, compactStringify } from '../utils/jsonOptimize';

const downloadCleanedJSON = () => {
  if (!cleanedOutput) return;
  const blob = new Blob([compactStringify(cleanedOutput)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = "tutorial_workflow_cleaned.json";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

const downloadSkeletonJSON = () => {
  if (!cleanedOutput) return;
  const skeleton = extractSkeleton(cleanedOutput);
  const blob = new Blob([compactStringify(skeleton)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = "tutorial_workflow_skeleton.json";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};
```

The `cleanedOutput` is passed as a prop from the parent component (AnalysisView.tsx → ResultsTimeline.tsx).

**UI consideration:** The three export options should be clearly labeled (e.g., as a dropdown or button group):
- "Export Raw" — Full relational format with IDs, bounding boxes, all fields. Use for Playwright export, re-import, or custom tooling.
- "Export Cleaned" — Denormalized, LLM-optimized format. Use for writing workflow specs, documentation, or feeding to other LLMs.
- "Export Skeleton" — Steps without inlined actions (~15-25% of cleaned size). Use for planning tutorial structure, outlining sections, or quick review. Calls `extractSkeleton(cleanedOutput)` client-side.

### 5d. Wire cleanedOutput through the API and frontend

The `cleanedOutput` must flow from server → polling response → frontend state → ResultsTimeline props.

**Expected payload size:** For a typical 15-minute video (~150 actions, ~25 narrative steps), the cleaned output is approximately 100-300 KB (roughly 40-60% smaller than the raw relational format due to field stripping and default removal). For long videos (30+ minutes, 300+ actions), this could reach 500 KB-1 MB. This is acceptable for a single delivery at job completion — the incremental polling (`unchanged: true`) already skips full-state payloads during processing, so `cleanedOutput` only appears in the final completion response. It does NOT inflate per-chunk poll traffic.

**Server (server.ts):** Already included in the full state response (`{...safeState}`), which spreads all job state fields. The incremental poll (`unchanged: true`) skips it — this is correct since `cleanedOutput` only exists after completion. No lazy-load needed: the existing pattern delivers full state once at completion, and the cleaned output is a denormalized restructuring of the raw data (smaller due to field stripping, but not interchangeable — the two formats serve different use cases).

**Frontend (AnalysisView.tsx):** Add state for `cleanedOutput` and populate it from poll responses when `state.cleanedOutput` is present. Pass as prop to ResultsTimeline.

---

## Design Decisions: What We're NOT Doing (and Why)

| Optimization | Decision | Reason |
|---|---|---|
| `indent: 0` (no whitespace) | **No** — use `indent: 1` | Phase D's 200+ action arrays need structural readability for input parsing. `indent: 1` saves ~50% whitespace while keeping nesting visible. |
| Compact `interacted_components` in prompts | **No** (prompts), **Yes** (final export) | Phase D needs structured objects to compare component names for naming consistency. Pipe format is fine for the denormalized export where no LLM reasoning happens on this data. |
| Drop `explanation` from previousStepsContext | **No** | Critical for Phase C continuity. Without it, the model re-explains concepts already covered in previous chunks. |
| Drop `postcondition` from previousStepsContext | **No** | The new step's precondition must flow from the prior postcondition for BDD chain integrity. |
| Drop `insight_type` from previousStepsContext | **No** | Prevents consecutive steps of the same type (e.g., two `workflow_framing` steps back-to-back). |
| Drop `linked_*_ids` from previousStepsContext | **Yes** | Bulk UUID arrays with no continuity value. The model doesn't need to know *which* action IDs were previously linked. |
| Drop `precondition` from previousStepsContext | **Yes** | Derivable from the prior step's postcondition, which is preserved. |
| Drop `id` from previousStepsContext | **Yes** | Step IDs are generated fresh by jobManager (line 430), not by the LLM. Previous step IDs have no reference value in the Phase C prompt. |
| Strip `confidence` from all phases | **Yes** | No dedup prompt references it. The dedup rule says "keep the most detailed." Zod forces it in output. |
| Strip `spatial_bounding_box` from prompts | **Yes** | Never referenced by any downstream prompt. Kept in stored data for Playwright compiler. |
| Strip `is_error_recovery: false` from prompts | **Yes** | Flag-by-presence pattern. AutomationCompiler needs it in *stored* data (both true/false), but prompt copies only need the `true` signal. Zod forces it in output. |
| Replace raw export with cleaned export | **No** — offer both | Raw relational format is required by AutomationCompiler (Playwright export uses `is_error_recovery` filter and `spatial_bounding_box` for coordinates). Cleaned format is for LLM consumption and documentation. |

---

## Files Modified

| File | Change | Risk |
|---|---|---|
| `utils/jsonOptimize.ts` | **NEW** — cleaning, compaction, diagnostic functions | None (new file) |
| `services/geminiService.ts` | Lines ~348, ~515-540, ~695-698 — compact serialization + field stripping at prompt injection points | Low — operates on copies, not stored data |
| `server/jobManager.ts` | Job state type (~line 17), post-pipeline cleaning (~line 608), diagnostic logging | Low — additive, wrapped in try/catch |
| `components/ResultsTimeline.tsx` | Lines ~108-130 — add cleaned export button | Low — additive UI element |
| `components/AnalysisView.tsx` | New state for `cleanedOutput`, pass as prop to ResultsTimeline | Low — additive wiring |

---

## Estimated Token Savings

| Optimization | Estimated Savings | Phase(s) |
|---|---|---|
| `indent: 2` → `indent: 1` | ~12-15% of whitespace tokens | B, C, D |
| Strip `confidence` + `spatial_bounding_box` + `chunkIndex` | ~5-8% per action | B, C, D |
| Strip null/empty/default fields | ~3-5% per action | B, C, D |
| Trim `previousStepsContext` (drop linked IDs, precondition, id) | ~30-45% reduction in context tokens | C |
| **Combined Phase B** | ~15-20% reduction per call | B |
| **Combined Phase C** | ~25-35% reduction per call | C |
| **Combined Phase D** | ~15-20% reduction per call | D |

For a typical 15-minute video (15 chunks, ~150 actions), estimated total savings: **~20-30% fewer prompt tokens across the pipeline run**.

---

## Interaction with Existing Plans

### PIPELINE_ROBUSTNESS_PLAN.md (✅ Implemented in PR #44)
- **No conflicts.** All robustness features (incremental polling, heartbeat, log cap, Phase C retry, debounced saves) operate on the stored data, not on prompt copies. The optimization touches prompt injection only.
- **Synergy:** The `cleanedOutput` field follows the same pattern as other state fields — it's created server-side and delivered via the existing polling mechanism.

### IMPLEMENTATION_PLAN_NARRATIVE_ACTION_LINKING.md (✅ Implemented)
- **Step 2 dependency (state_change in simplified actions):** Our Step 3a preserves the `state_change` field. The `stripEmptyAndDefaults` function only removes it when it's `undefined` (no interacted components), which is the existing behavior.
- **Step 6 dependency (link coverage validation):** Our Step 5b diagnostic functions complement but don't replace the existing link coverage check at lines 478-514. The `detectUnlinkedActions` function adds the *cross-chunk linking failure diagnosis* on top.

### GEMINI_3_OPTIMIZATION_PLAN.md (✅ Implemented)
- **Thought signatures:** Phase B's chat history preserves raw model response parts including `thoughtSignature`. Our optimization applies `compactStringify` to the *user message* part (line 357), not to the model response parts in chat history. No conflict.
- **Media resolution:** Phase A and Phase C use `mediaResolution: "media_resolution_high"`. Our optimization doesn't touch media configuration.

### Allium Spec (tutorial-dissector.allium.md)
- **AutomationCompiler surface:** Requires `is_error_recovery` on stored actions for golden-path filtering, and `spatial_bounding_box` for Playwright coordinate extraction. Both are preserved in stored data. Only stripped from prompt copies and the cleaned export (which is explicitly labeled as not for automation).
- **Entity relationships:** The cleaned export breaks the relational model (inlines entities, removes cross-reference IDs). This is intentional and only affects the separate "Export Cleaned" path. The raw export preserves the full relational structure.

---

## Verification

1. **Token savings measurement:** Run the pipeline on an existing video. Compare Gemini usage logs (input token counts) before and after optimization. Target: ≥15% reduction.

2. **Data integrity:** After pipeline completion, verify:
   - All stored actions have `ui_context` (zipper re-attachment works).
   - All stored actions have `confidence`, `spatial_bounding_box`, `chunkIndex` (not stripped from stored data).
   - All stored actions have `is_error_recovery` (both `true` and `false` values present).
   - Playwright export still generates valid coordinate-based `page.mouse.click()` calls.

3. **Narrative quality:** Compare Phase C output before/after on a test video:
   - Preconditions still chain correctly (postcondition of step N → precondition of step N+1).
   - No duplicate explanations between chunks (continuity preserved via explanation field).
   - Link coverage percentage (logged at line 510) should not decrease.

4. **Phase D quality:** Compare global dedup output before/after:
   - Naming consistency should be maintained (same UI elements have same names throughout).
   - Dedup count should be similar (model still correctly identifies duplicates without `confidence` signal).

5. **Cleaned export validation:** Compare TypeScript `cleanFinalOutput()` output against Python `clean_json()` output on the same input. Structure should match.

6. **Diagnostic logging:** Verify `detectUnlinkedActions` and `detectRedundantSteps` produce meaningful warnings in the dev console when appropriate.
