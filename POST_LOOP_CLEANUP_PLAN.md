# Post-Loop Cleanup: Sort, Orphan Merge, Schema Normalization, Annotation Filter

> **Status:** Implementation prompt — ready for execution
> **Scope:** `server/jobManager.ts` (primary), `types.ts` (reference), `utils/jsonOptimize.ts` (reference), `utils/timeUtils.ts` (reference)

---

## Context

After all chunks are processed but before Phase D global deduplication, the pipeline accumulates three arrays: `cumulativeActions`, `cumulativeAnnotations`, and `cumulativeNarrative`. These arrays suffer from several issues that deterministic post-processing can fix without additional LLM calls:

1. **Out-of-order narrative steps** — Overlapping chunk windows and LLM non-determinism produce narrative steps whose timestamps are not monotonically increasing. Downstream consumers (timeline UI, cleaned output) expect chronological order.
2. **Orphan narrative steps** — Some steps have zero action or annotation links, making them disconnected from the visual evidence. When an orphan is topically related to a nearby linked step, merging its explanation preserves the information without cluttering the timeline.
3. **Inconsistent action schemas** — The LLM sometimes omits optional fields (`is_error_recovery`, `interacted_components`, `context_note`, `confidence`). This causes inconsistent shapes in the raw "Full Workflow Graph" export and can bias Phase D deduplication.
4. **Placeholder annotations** — The LLM occasionally produces annotations with stub content like "No annotations" or "Not extracted" instead of omitting them. These add noise to the output.

---

## Change 1: Monotonic Timestamp Sort + Orphan Merge

**Insert location:** `server/jobManager.ts`, immediately after the chunk processing loop ends (after `state.currentChunkIndex = i + 1; bumpVersion(state);` and the closing `}` of the for-loop). This is before the existing coverage validation block.

### Step 1a: Sort

Sort `cumulativeNarrative` in-place by `parseMMSS(step.timestamp)` ascending (already imported from `utils/timeUtils.ts`). Log only if the sort actually changed the order (compare serialized timestamp strings before/after to avoid noise).

### Step 1b: Broken-link cleanup (MUST run before orphan detection)

Before identifying orphans, strip stale link IDs from every step. Build `Set`s of all valid action IDs (`cumulativeActions.map(a => a.id)`) and annotation IDs (`cumulativeAnnotations.map(a => a.id)`). For each step:
- Filter `linked_visual_action_ids` to only IDs present in the action set
- Filter `linked_annotation_ids` (if defined) to only IDs present in the annotation set

This prevents steps with only stale/broken link IDs from being misclassified as "linked" and skipped by the orphan merge.

> **Why before orphan merge:** Without this, a step referencing a deleted action ID appears linked (non-empty array), so it escapes orphan detection. Then the coverage validation later strips those IDs, leaving the step unlinked anyway — but now it's too late to merge it.

### Step 1c: Orphan identification

An orphan is a step where **all three** conditions hold:
1. `linked_visual_action_ids.length === 0` (after broken-link cleanup)
2. `linked_annotation_ids` is undefined, null, or empty (after broken-link cleanup)
3. `insight_type` is NOT one of: `'rationale'`, `'workflow_framing'`, `'tip'`, `'warning'`, `'comparison'`

The exclusion list covers all non-procedural insight types. These are standalone by design — they provide context, tips, or framing rather than describing user actions. Only `'explanation'` steps (the default procedural type) are merge candidates. This aligns with the coverage validation exemption, which already skips `'rationale'` steps when counting unlinked steps — we extend the same logic to all non-procedural types.

Log the orphan count: `"Found N orphan explanation steps for merge analysis."`

### Step 1d: Merge computation (two-pass to avoid index corruption)

**First pass — collect merge instructions:** For each orphan, find its best merge target:
- Search all non-orphan steps
- Candidate must be within **15 seconds** (`Math.abs(parseMMSS(neighbor.timestamp) - parseMMSS(orphan.timestamp)) <= 15`)
- Candidate must have **Jaccard similarity >= 0.3** on `topics` arrays (case-insensitive). Jaccard = |intersection| / |union|; if both topic sets are empty, Jaccard = 0 (no match)
- Among qualifying candidates, pick the one with highest Jaccard. **Tiebreaker:** prefer the preceding (earlier timestamp) neighbor

If no eligible neighbor exists, skip this orphan — keep it as-is.

Store merge instructions as an array of `{ orphanIndex, neighborIndex }` pairs.

**Second pass — execute merges:** Apply merges and produce a new filtered array (do NOT use in-place `splice` during iteration):
- For each merge: append the orphan's `explanation` to the neighbor's `explanation`. Use a separator that respects existing punctuation: if the neighbor's explanation already ends with `.`, `?`, or `!`, use a single space; otherwise append `. ` before the orphan's text
- Union the orphan's `topics` into the neighbor's `topics` (deduplicate, preserve order with neighbor's topics first)
- The neighbor retains all its own fields (`intent`, `precondition`, `postcondition`, `timestamp`, `insight_type`, `id`, all linked IDs) unchanged
- Filter `cumulativeNarrative` to remove all merged orphans (produce new array via `.filter()`)

Reassign `state.narrativeSteps = cumulativeNarrative` (the variable is already the same reference, but be explicit after reassigning the array).

Log: `"Merged N orphan steps into linked neighbors. M orphans had no eligible neighbor and were kept."`

### Step 1e: Remove the now-redundant coverage validation broken-link cleanup

Since Step 1b already strips broken links before orphan merge, the existing broken-link cleanup in the coverage validation block becomes redundant. However, **keep it in place** as a defensive second pass — it has no cost and protects against future code reordering. Just note in a comment that the primary cleanup happens in Step 1b.

---

## Change 2: Schema Normalization

**Insert location:** Define a helper function `normalizeActionDefaults(actions: ActionItem[])` near the top of `processJob` (alongside `addLog`). Call it in two places:
1. After Phase D success: on `deduplicatedActions` (after `state.actions = deduplicatedActions`)
2. In the Phase D catch block: on `state.actions` (which still references `cumulativeActions` at that point), after the existing `addLog('warn', ...)` call

### Default values

For each action in the array, fill missing optional fields with **type-correct** defaults:

| Field | Type (from `types.ts`) | Default | Rationale |
|-------|----------------------|---------|-----------|
| `is_error_recovery` | `boolean \| undefined` (optional) | `false` | Most actions are not error recovery |
| `interacted_components` | `UIComponent[] \| undefined` (optional) | `[]` | Empty array, not null — type is array-or-undefined |
| `context_note` | `string \| null` (required, nullable) | `null` | NOT `''` — empty string gets stripped by `stripEmptyAndDefaults`, and `null` is the type's explicit "absent" value |
| `confidence` | `ActionConfidence` (required) | `'high'` | Matches the existing `GLOBAL_DEDUPLICATION_PROMPT` spec which states `"confidence": "high" (default if not set)` |

**Do NOT set** `input_data` — the type is `InputData | undefined` (optional, not nullable). Setting it to `null` would violate the type. Leaving it `undefined` (absent) is correct and `stripEmptyAndDefaults` handles it.

### Purpose

This normalization serves two consumers:
1. **Phase D deduplication** — Consistent field shapes prevent spurious diffs when comparing actions
2. **Raw "Full Workflow Graph" export** — Users who inspect the intermediate state see complete records

It is deliberately redundant with `cleanFinalOutput()` stripping, which serves the cleaned export.

---

## Change 3: Placeholder Annotation Filter

**Insert location:** `server/jobManager.ts`, in the per-chunk annotation processing section. Add a `.filter()` **before** the `.map()` that assigns new IDs to `validated_segment_annotations`.

### Filter logic

Remove annotations where the **entire trimmed content** matches a placeholder pattern:

```typescript
const PLACEHOLDER_RE = /^(no annotations|not extracted|none provided|no relevant annotations|none)\.?$/i;
```

The filter chain:
1. `!ann.content?.trim()` → remove empty/whitespace-only (existing check)
2. `PLACEHOLDER_RE.test(ann.content.trim())` → remove placeholder stubs

**Critical details:**
- Use **full-content regex match** (`test` against trimmed content), NOT `.includes()` substring match. Substring matching is too broad — a legitimate annotation like "The instructor selected none provided by default" would be incorrectly filtered
- The regex is **case-insensitive** (`/i` flag) to catch "No Annotations", "NOT EXTRACTED", etc.
- Do **NOT** filter by `annotation_type === 'info'` — this is a legitimate annotation type that may carry real content. The `AnnotationType` union in `types.ts` does not include `'info'` as a named variant, but the `| string` catch-all allows it. Filtering by type alone would remove valid annotations
- If placeholder annotations are removed, log the count: `"Filtered N placeholder annotations from chunk."`

### Interaction with downstream

Phase C (narrative synthesis) receives annotations via `relevantAnnotations`, which is computed from `cumulativeAnnotations`. Since placeholders are filtered before entering `cumulativeAnnotations`, Phase C never sees them and won't create broken links. This is correct.

---

## Ordering Summary

```
Per-chunk loop:
  Phase A → Phase B → [Change 3: filter placeholders] → Phase C → accumulate

Post-loop:
  [Change 1b: broken-link cleanup]
  [Change 1a: sort by timestamp]
  [Change 1c+1d: orphan merge]
  Coverage validation (existing, kept as defensive second pass)
  Phase D global deduplication
  [Change 2: normalize action defaults on success path]
  Phase D catch block
  [Change 2: normalize action defaults on catch path]
  cleanFinalOutput
```

Change 1b (broken-link cleanup) MUST precede Change 1c+1d (orphan identification/merge). Change 1a (sort) can run before or after broken-link cleanup, but before orphan merge so that "nearest neighbor" is well-defined on a sorted array.

---

## Files to Modify

| File | Changes |
|------|---------|
| `server/jobManager.ts` | All three changes. Add `normalizeActionDefaults` helper. Add placeholder regex constant. Modify annotation filter in chunk loop. Add post-loop sort + orphan merge block. |

No changes to `types.ts`, `utils/jsonOptimize.ts`, or `utils/timeUtils.ts`. These are reference-only for understanding type constraints and existing stripping behavior.
