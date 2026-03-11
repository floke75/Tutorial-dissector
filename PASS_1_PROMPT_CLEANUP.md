# Pass 1: Prompt Cleanup & Narration Quality (`constants.ts`)

## Context

Tutorial Dissector extracts structured workflow graphs from video tutorials using a 4-phase pipeline:
- **Phase A** (`PHASE_A_SYSTEM_PROMPT`): Extracts raw UI actions and annotations per video chunk
- **Phase B** (`PHASE_B_SYSTEM_PROMPT`): Deduplicates actions across overlapping chunks, assigns IDs
- **Phase C** (`PASS_2_SYSTEM_PROMPT`): Generates narrative steps that group and explain the actions
- **Phase D** (`GLOBAL_DEDUPLICATION_PROMPT`): Final holistic polish pass across the complete action log

All four prompts are defined in `constants.ts`. This pass modifies all four to fix prompt waste, conflicting rules, and missing guidance.

## Defects Fixed

| Issue | Root Cause |
|---|---|
| Phase A treats all UI responses identically. Immediate responses (dialog opens on click) should be captured in the triggering action's `result` field, but the prompt says "log EVERY UI response" without distinguishing immediate from async. This creates redundant system_event actions that clutter the log. | No triage heuristic for immediate vs. async responses. |
| Phase B's system event preservation rule is unconditional — it forbids dropping ANY system event, even redundant ones that duplicate a nearby action's `result` field. This conflicts with Phase A's updated triage. | Blanket preservation without nuance. |
| Phase D Rule 1 contradicts the updated Phase B Rule 2. Phase D says "DO NOT remove system events just because they occur near a user action" while Phase B now allows removal when a system event restates a nearby `result` field. This cross-prompt inconsistency causes divergent LLM behavior. | Rules accumulated independently across phases without cross-phase alignment. |
| Phase D Rule 5 (NARRATIVE FLOW) rewrites the `detail` field, which breaks the Zipper ID-matching in `geminiService.ts` (lines 766-788) that re-attaches `ui_context` using `timestamp + action_type + detail` as a fallback. | No awareness of downstream matching constraints. |
| Phase D has no timestamp protection. The Zipper fallback matches on `timestamp + action_type`, so if Phase D modifies timestamps, `ui_context` is permanently lost. | Missing constraint for downstream dependency. |
| Phase D Rule 4 (NAMING CONSISTENCY) doesn't reference the custom app context glossary, even though `geminiService.ts` appends `customContext` below the prompt at runtime. | Rule doesn't reference available context. |
| Phase C Rule 7 says "timestamp must reflect when the explanation starts in the audio." For standalone conceptual steps, the narrator explains after demonstrating — audio timestamp is 10-20s after the actions. Next chunk's linked step covers earlier actions, causing timestamp regression. The monotonic constraint must apply to ALL step types, not just standalone steps. | Audio timing diverges from action timing at chunk boundaries. No universal monotonicity guard. |
| Phase C Rule 8 says "genuinely distinct content" for standalone steps, but provides no examples. Model interprets too loosely — generates orphan steps like "Compose a playlist" next to "Populate a playlist with overlays." | Abstract instruction without anchoring examples. |
| Phase C Rule 5 says "MUST strive to link EVERY" action. This pressures the model into generating extra thin steps to cover audio content, conflicting with Rule 8 (fold into linked step) and Rule 11 (step economy). | Absolute coverage mandate conflicts with quality rules. |
| Phase C Rules 2, 4, 5 reference "system events" as a primary category equal to user actions. With the updated Phase A triage, most system events are now folded into `result` fields — only async ones remain as separate actions. The terminology should reflect this. | Stale terminology after Phase A/B updates. |

## Implementation

**All changes are in `constants.ts`. No other files are modified.**

### 1. Phase A — Rewrite Rule 2

Locate in `PHASE_A_SYSTEM_PROMPT`:
```
2. Log EVERY UI response: dialogs appearing/closing, panels expanding/collapsing, progress bars, loading states, error messages.
```

Replace with:
```
2. Log UI responses as follows:
   - IMMEDIATE responses (< ~2s after user action, e.g., dialog opens after a click, panel expands): capture in the triggering user action's "result" field. Do NOT create a separate system_event/ui_response action for these.
   - DELAYED or ASYNC responses (> ~2s, or no clear triggering action visible, e.g., export completes, progress bar finishes, error after processing): log as a separate action with action_type "ui_response" or "system_event" and actor "system".
```

**Rationale:** The Phase A schema still lists `system_event`/`ui_response` as valid `action_type` values and `system` as a valid `actor`. A blanket ban on separate events would contradict the schema. This triage heuristic preserves schema validity while folding immediate responses into `result` where they belong.

### 2. Phase B — Soften system events rule

Locate in `PHASE_B_SYSTEM_PROMPT`:
```
2. PRESERVE SYSTEM EVENTS: Do NOT drop "ui_response" or "system_event" actions. They are critical for understanding the application's behavior. A user action (like a click) and the resulting system event (like a dialog opening) are distinct and MUST both be kept.
```

Replace with:
```
2. PRESERVE ASYNC SYSTEM EVENTS: Do NOT drop "ui_response" or "system_event" actions that represent delayed or asynchronous application behavior (e.g., a render completing, an export finishing, an error appearing after processing). If a system event merely restates what a nearby action's "result" field already describes, it may be removed as a duplicate.
```

**Rationale:** Removing the rule entirely would lose the safety net for legitimate async events. Softening it aligns with the Phase A triage while preserving genuinely distinct async events that survived Phase A.

### 3. Phase D — Targeted edits (NOT full replacement)

#### 3a. Align Rule 1 with Phase B (fix cross-prompt contradiction)

Locate in `GLOBAL_DEDUPLICATION_PROMPT`:
```
1. DEDUPLICATION: Identify actions that occur at the exact same timestamp (or within 1-2 seconds of each other) that represent the EXACT SAME user action or system event. Keep the one with the most detailed "target" and "interacted_components" information, and discard the other. DO NOT remove system events (like ui_response) just because they occur near a user action.
```

Replace with:
```
1. DEDUPLICATION: Identify actions that occur at the exact same timestamp (or within 1-2 seconds of each other) that represent the EXACT SAME user action or system event. Keep the one with the most detailed "target" and "interacted_components" information, and discard the other. Preserve async system events (ui_response, system_event) that represent genuinely delayed application behavior. If a system event merely restates what a nearby user action's "result" field already describes, it IS a duplicate and should be removed.
```

**Rationale:** The original "DO NOT remove system events just because they occur near a user action" directly contradicts Phase B's updated rule allowing removal of redundant system events. This alignment ensures consistent dedup behavior across phases.

#### 3b. Add custom context reference to Rule 4

Locate in `GLOBAL_DEDUPLICATION_PROMPT`:
```
4. NAMING CONSISTENCY: Ensure UI elements, panels, and tools are named consistently throughout the entire log. For example, if a panel is called "Properties Panel" in one action and "Props" in another, standardize it to the most accurate and descriptive name.
```

Replace with:
```
4. NAMING CONSISTENCY: Ensure UI elements, panels, and tools are named consistently throughout the entire log. For example, if a panel is called "Properties Panel" in one action and "Props" in another, standardize it to the most accurate and descriptive name. If CUSTOM APP CONTEXT is appended below, prefer its terminology as the canonical standard.
```

**Rationale:** `geminiService.ts` (line 720-722) appends `customContext` after placeholder substitution. The phrasing "appended below" accurately describes the runtime injection point.

#### 3c. Protect `detail` field in Rule 5

Locate in `GLOBAL_DEDUPLICATION_PROMPT`:
```
5. NARRATIVE FLOW: Ensure the "detail", "result", and "context_note" fields flow logically from one action to the next. Fix any jarring inconsistencies in tone or terminology.
```

Replace with:
```
5. RESULT QUALITY: Ensure every action's "result" field clearly describes the visible UI outcome. Replace vague results like "Action performed" with specifics (e.g., "The Export Settings dialog opens"). Do NOT rewrite the "detail" field — it must stay close to its original wording to preserve cross-reference integrity.
```

**Rationale:** The Zipper in `geminiService.ts` (lines 766-788) falls back to matching on `timestamp + action_type + detail`. Rewriting `detail` breaks this fallback and causes `ui_context` to be permanently lost from actions. The `result` field improvement is valuable and safe; the `detail` field must be protected.

#### 3d. Add timestamp protection to Rule 7

Locate in `GLOBAL_DEDUPLICATION_PROMPT`:
```
7. ID PRESERVATION: DO NOT change the "id" field of any action. You MUST keep the original "id" exactly as it was provided. If you remove a duplicate action, simply omit it from the output.
```

Replace with:
```
7. ID & TIMESTAMP PRESERVATION: DO NOT change the "id" or "timestamp" field of any action. You MUST keep these exactly as provided. If you remove a duplicate, simply omit it from the output.
```

**Rationale:** The Zipper fallback also matches on `timestamp + action_type`. If Phase D modifies timestamps, the Zipper can't re-attach `ui_context`, causing silent data loss. This makes the constraint explicit.

#### 3e. Keep Rule 6 (SORTING) as-is

Do NOT remove Rule 6. No downstream code sorts after Phase D — removing the sorting instruction would produce unsorted output.

### 4. Phase C — Rewrite Rule 7

Locate in `PASS_2_SYSTEM_PROMPT`:
```
7. **INDEPENDENT TIMING:** The timestamp must reflect when the explanation starts in the audio.
```

Replace with:
```
7. **MONOTONIC TIMING:** Every step's timestamp MUST be equal to or later than the previous step's timestamp — never go backwards. For steps with linked actions, use the timestamp of the FIRST (earliest) linked action, but clamp it to be no earlier than the previous step's timestamp. For standalone conceptual steps, use the audio timestamp, clamped the same way. If the computed timestamp would regress, use the previous step's timestamp instead.
```

**Rationale:** The monotonic constraint must be universal — applying to both linked and standalone steps. Linked steps using "earliest linked action" can also regress at chunk boundaries (e.g., chunk N+1's first action is earlier than chunk N's last narrative step). The "clamp to previous step" rule is a single backward-looking constraint that autoregressive models can enforce without look-ahead.

### 5. Phase C — Strengthen Rule 8

Locate the end of Rule 8 in `PASS_2_SYSTEM_PROMPT`, currently ending with:
```
Only create a standalone conceptual step when it covers genuinely distinct content with no adjacent linked step covering the same topic.
```

Append (still within Rule 8):
```
 MERGE SIGNALS — these patterns MUST be folded into the adjacent linked step's "explanation", NOT created as standalone steps:
    - "Understand the export settings" (0 actions) next to "Configure and run the export" (has actions) → MERGE: the understanding IS the configuration context.
    - "Prepare the workspace layout" (0 actions) next to "Arrange panels for the editing workflow" (has actions) → MERGE: same topic.
    - "Learn about keyboard shortcuts" (0 actions) next to "Use shortcuts to duplicate elements" (has actions) → MERGE: the shortcut knowledge belongs in the action step.
    When in doubt, ALWAYS fold conceptual context into the nearest linked step's explanation rather than creating a standalone step.
```

**Rationale:** Examples use generic software tutorial patterns (exports, panels, shortcuts) rather than domain-specific terminology, since this tool processes any software tutorial.

### 6. Phase C — Soften Rule 5 and update Rules 2, 4 for consistency

#### 6a. Rule 5

Locate in `PASS_2_SYSTEM_PROMPT`:
```
5. **MAXIMIZE COVERAGE:** You MUST strive to link EVERY non-error visual action, system event, and annotation provided in the INPUT CONTEXT to at least one Narrative Step. Do not leave visual actions, system events, or annotations "orphaned" without a corresponding narrative explanation unless they are truly irrelevant background noise.
```

Replace with:
```
5. **MAXIMIZE COVERAGE:** Link as many non-error visual actions and annotations as possible to Narrative Steps. Async system events (action_type "system_event"/"ui_response") should also be linked when present. It is acceptable for a small number of minor actions (e.g., a preparatory click before a larger workflow, trivial UI feedback) to remain unlinked if linking them would require a thin, low-value step. Prioritize step quality and economy (Rule 11) over exhaustive coverage.
```

**Rationale:** The absolute mandate "MUST strive to link EVERY" conflicts with Rule 8 (fold into linked step) and Rule 11 (step economy). Softening removes this conflict while retaining annotations in the coverage scope.

#### 6b. Rule 2

Locate in `PASS_2_SYSTEM_PROMPT`:
```
2. **GROUPING:** Group a sequence of visual actions, system events, and annotations into a single logical "Step" (e.g., "Set up project configuration").
```

Replace with:
```
2. **GROUPING:** Group a sequence of visual actions and annotations into a single logical "Step" (e.g., "Set up project configuration"). Include any async system events that belong to the same workflow.
```

#### 6c. Rule 4

Locate in `PASS_2_SYSTEM_PROMPT`:
```
4. **DEEP LINKING:** You MUST include an array of the exact "id" strings of the visual actions and system events that belong to this step ("linked_visual_action_ids"). DO NOT link actions flagged as "is_error_recovery" if they represent abandoned mistakes. If the step is purely conceptual or background context, this array can be empty. You MUST also include an array of the exact "id" strings of the annotations that belong to this step ("linked_annotation_ids").
```

Replace with:
```
4. **DEEP LINKING:** You MUST include an array of the exact "id" strings of the visual actions (including any async system events) that belong to this step ("linked_visual_action_ids"). DO NOT link actions flagged as "is_error_recovery" if they represent abandoned mistakes. If the step is purely conceptual or background context, this array can be empty. You MUST also include an array of the exact "id" strings of the annotations that belong to this step ("linked_annotation_ids").
```

**Rationale:** With the Phase A triage update, most system events are now folded into `result` fields. Only async ones survive as separate actions. Rules 2, 4, 5 are updated consistently to reflect this — "system events" is no longer listed as a primary category but acknowledged as an occasional async presence.

## Constraints

- Do NOT renumber rules in any prompt. Changes modify existing rules in-place.
- Do NOT modify any code in `geminiService.ts`, `jobManager.ts`, or any other file. This pass is prompt-text-only.
- Do NOT add new rules to `PHASE_A_SYSTEM_PROMPT` — Change 1 is a rewrite of an existing rule.
- Do NOT remove Phase D Rule 6 (SORTING) — no downstream code sorts after Phase D.
- Phase A schema (action_type enum in the JSON example) remains unchanged — `system_event` and `ui_response` remain valid for async cases.

## Verification

After implementation, search `constants.ts` for:
- `"IMMEDIATE responses"` in `PHASE_A_SYSTEM_PROMPT` → should appear
- `"PRESERVE ASYNC SYSTEM EVENTS"` in `PHASE_B_SYSTEM_PROMPT` → should appear
- `"DO NOT remove system events"` in `GLOBAL_DEDUPLICATION_PROMPT` → should NOT appear (replaced with aligned language)
- `"TIMESTAMP PRESERVATION"` in `GLOBAL_DEDUPLICATION_PROMPT` → should appear
- `"CUSTOM APP CONTEXT is appended below"` in `GLOBAL_DEDUPLICATION_PROMPT` → should appear
- `"Do NOT rewrite the \"detail\" field"` in `GLOBAL_DEDUPLICATION_PROMPT` → should appear
- `"SORTING"` in `GLOBAL_DEDUPLICATION_PROMPT` → should still appear (preserved)
- `"MONOTONIC TIMING"` in `PASS_2_SYSTEM_PROMPT` → should appear
- `"INDEPENDENT TIMING"` in `PASS_2_SYSTEM_PROMPT` → should NOT appear (replaced)
- `"MERGE SIGNALS"` in `PASS_2_SYSTEM_PROMPT` → should appear
- `"MUST strive to link EVERY"` in `PASS_2_SYSTEM_PROMPT` → should NOT appear (replaced)
- `"{narrative_context}"` in `GLOBAL_DEDUPLICATION_PROMPT` → should appear (preserved)
