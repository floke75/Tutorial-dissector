# Implementation Plan: Narrative–Action Linking & Output Quality

**Supersedes:** `ARCHITECTURE_REMEDIATION_PLAN.md` (Phases 1–3 implemented; this plan addresses remaining defects exposed by testing)

**Symptom summary from test runs:** ~58% of visual actions are never referenced by any narrative step. Intra-chunk duplicate steps are generated. Narration can contradict the actual user actions. Optional fields are inconsistently present across visual actions.

---

## Root Causes

| # | Defect | Location | Impact |
|---|---|---|---|
| RC-1 | Phase C receives only the current chunk's actions, not the cumulative set filtered to the clip window | `server/jobManager.ts` | Steps covering overlap-window actions have nothing to link to → empty `linked_visual_action_ids` |
| RC-2 | `PASS_2_SYSTEM_PROMPT` Rule 7 encourages standalone conceptual steps adjacent to linked steps covering the same activity | `constants.ts` | Intra-chunk near-duplicate step pairs |
| RC-3 | Simplified action payload strips `interacted_components` | `services/geminiService.ts` (`analyzeNarrationSegment`) | Model cannot see state transitions → narration contradicts what user actually did |
| RC-4 | Phase C uses text-mode JSON parsing, not `responseSchema` with enum constraints | `services/geminiService.ts` | `insight_type` and other enum fields drift from `types.ts` literals |
| RC-5 | `GLOBAL_DEDUPLICATION_PROMPT` does not normalize optional fields | `constants.ts` | Inconsistent presence of `interacted_components`, `input_data`, `is_error_recovery` across actions |

---

## Step 1 — Widen the action context window for Phase C

**Goal:** Ensure every narrative step can link to any action visible or audible in the video clip, not just actions that were first logged in the current chunk.

**Target:** `server/jobManager.ts` — inside the per-chunk loop, the call to `analyzeNarrationSegment`.

**Current code (paraphrased):**
```typescript
const newNarrativeSteps = await analyzeNarrationSegment(
  videoUrl,
  chunk.clipStart,
  chunk.clipEnd,
  phaseBResult.result.validated_segment_events,   // ← only this chunk
  customContext,
  apiKey,
  cumulativeNarrative.slice(-3),
  addLog
);
```

**Spec:**
1. Replace the `relevantVisualActions` argument. Instead of passing `phaseBResult.result.validated_segment_events`, compute a time-filtered slice of `cumulativeActions`:
   ```typescript
   const CONTEXT_BUFFER_SEC = 15;
   const contextStart = chunk.clipStart - CONTEXT_BUFFER_SEC;
   const contextEnd   = chunk.clipEnd   + CONTEXT_BUFFER_SEC;

   const relevantActions = cumulativeActions.filter(a => {
     const t = parseMMSS(a.timestamp);
     return t >= contextStart && t <= contextEnd;
   });
   ```
2. Pass `relevantActions` instead:
   ```typescript
   const newNarrativeSteps = await analyzeNarrationSegment(
     videoUrl,
     chunk.clipStart,
     chunk.clipEnd,
     relevantActions,
     customContext,
     apiKey,
     cumulativeNarrative.slice(-3),
     addLog
   );
   ```
3. This must execute *after* the current chunk's actions have been appended to `cumulativeActions`, so move the `cumulativeActions = [...cumulativeActions, ...phaseBResult.result.validated_segment_events]` line to *before* the Phase C call (it is already in this position in the current code — verify this holds).

**Why this fixes RC-1:** The model now sees all actions whose timestamps fall within or near the clip window, including actions logged by previous chunks. It can link to `evt_001` through `evt_N` regardless of which chunk originally produced them.

**Risk:** For very long videos, this could send a large action list to Gemini. Mitigate by capping at the 150 most recent actions within the window, or by only including `id`, `timestamp`, `action_type`, `element`, `detail`, and the new `interacted_components` summary (see Step 2).

**Verification:**
- After processing, count actions referenced by at least one narrative step vs total actions. Target: ≥80% coverage (some `ui_response` system actions may legitimately go unlinked).
- Confirm no step has empty `linked_visual_action_ids` unless its `insight_type` is explicitly conceptual/rationale with no corresponding user action.

---

## Step 2 — Include state transitions in simplified action payload

**Goal:** Give the narration model ground-truth about what the user actually changed, not just what they clicked.

**Target:** `services/geminiService.ts` — the `simplifiedActions` mapping inside `analyzeNarrationSegment`.

**Current code:**
```typescript
const simplifiedActions = relevantVisualActions.map(a => ({
  id: a.id,
  timestamp: a.timestamp,
  action: a.action_type,
  element: a.target?.element,
  detail: a.detail,
  is_error_recovery: a.is_error_recovery
}));
```

**Spec:** Add a `state_change` summary derived from `interacted_components`:
```typescript
const simplifiedActions = relevantVisualActions.map(a => ({
  id: a.id,
  timestamp: a.timestamp,
  action: a.action_type,
  element: a.target?.element,
  detail: a.detail,
  is_error_recovery: a.is_error_recovery,
  state_change: a.interacted_components?.length
    ? a.interacted_components.map(c => ({
        label: c.label,
        from: c.state_before ?? null,
        to: c.state_after ?? null,
      }))
    : undefined
}));
```

**Why this fixes RC-3:** When the model sees `{ label: "Include content in timings", from: "checked", to: "unchecked" }`, it can correctly describe the action as disabling the setting, even if the narrator's spoken phrasing is ambiguous or says the opposite. The model has both the audio and the structured state transition — the structured data wins ties.

**Verification:**
- For any step whose explanation references a toggle, checkbox, or dropdown, compare the step's description against the `interacted_components` state transition in the linked actions. They should not contradict.

---

## Step 3 — Tighten PASS_2_SYSTEM_PROMPT to prevent intra-chunk duplicates

**Goal:** Eliminate the pattern where the model generates a conceptual "framing" step immediately followed by a mechanically-linked step covering the same user activity.

**Target:** `constants.ts` — `PASS_2_SYSTEM_PROMPT`, Rule 7.

**Current Rule 7:**
```
7. **STANDALONE CONTEXT:** Narrative blocks do not always have to be linked to actions
in the execution graph. If the narration contains important context, background
information, or conceptual explanations that are separate from user actions but
necessary to fully understand the application or workflow, you MUST include them
as a step.
```

**Replace with:**
```
7. **STANDALONE CONTEXT:** If the narration contains important background context or
conceptual explanations that have NO corresponding user actions in the execution graph
(e.g., the narrator explains a concept before demonstrating it, or provides a summary
after a section), capture this as a standalone step with an empty
"linked_visual_action_ids" array.
However, if the conceptual explanation DIRECTLY introduces or describes the same
activity as the next linked step (same UI area, same time window), DO NOT create a
separate step. Instead, fold the conceptual context into the "explanation" field of
the linked step. Only create a standalone conceptual step when it covers genuinely
distinct content with no adjacent linked step covering the same topic.
```

**Add new Rule 9:**
```
9. **NO DUPLICATE INTENT:** Never generate two consecutive steps with the same or
synonymous "intent". If you find yourself creating a step that restates the previous
step's goal (e.g., "Prepare to insert blocks" followed by "Insert blocks"), merge
them into a single step. Each step must represent a distinct user goal.
```

**Why this fixes RC-2:** The model is currently told it MUST create standalone steps for conceptual context, which it interprets as a mandate to always generate them. The revised rule makes standalone steps conditional on there being no adjacent linked step. Rule 9 provides an explicit merge instruction for the common case.

**Verification:**
- After processing, scan the output for consecutive step pairs where:
  - Timestamps are ≤10s apart, AND
  - One has empty `linked_visual_action_ids` and the other has links, AND
  - Their `intent` strings share ≥50% of non-stopword tokens.
- If any such pairs exist, the prompt revision needs further tightening.

---

## Step 4 — Enforce `insight_type` via responseSchema

**Goal:** Guarantee `insight_type` values match the `InsightType` enum in `types.ts` at the schema level, not just via prompt examples.

**Target:** `services/geminiService.ts` — the `config` object in `analyzeNarrationSegment`'s `generateContent` call.

**Current state:** The narration call already uses `responseSchema: fixNullable(zodToJsonSchema(pass2Schema, ...))`. Confirm that `pass2Schema` enforces `insight_type` as an enum.

**Spec:**
1. Locate the Zod schema definition for `pass2Schema` (likely in `geminiService.ts` or a shared schema file).
2. Verify the `insight_type` field uses `z.enum(["explanation", "rationale", "tip", "warning", "workflow_framing", "comparison"])`.
3. If it uses `z.string()` instead, replace it with the enum.
4. Cross-reference against the `InsightType` type in `types.ts` to ensure the literal values match exactly. If `types.ts` has been updated since the last remediation, use its values as the source of truth.

**Why this fixes RC-4:** Schema-level enforcement means Gemini's structured output mode will reject any value outside the enum, eliminating hallucinated labels like `"instructional"` or `"action"` that appeared in earlier versions.

**Verification:**
- After processing any video, assert every step's `insight_type` is one of the 6 enum values.
- If the assertion fails, check whether the narration call is falling back to text-mode parsing (the `cleanText = text.replace(...)` path). If so, that fallback path also needs post-validation.

---

## Step 5 — Normalize optional fields in global deduplication

**Goal:** Ensure every visual action in the final output has a consistent, complete schema regardless of which phase populated it.

**Target:** `constants.ts` — `GLOBAL_DEDUPLICATION_PROMPT`.

**Spec:** Append the following rule to the prompt:

```
7. SCHEMA NORMALIZATION: Every action in the output MUST include ALL of the following
fields. If a field was not populated during extraction, apply the specified default:
   - "interacted_components": [] (empty array if no components were interacted with)
   - "input_data": null (null if no keyboard input occurred)
   - "is_error_recovery": false (false unless explicitly flagged)
   - "context_note": "" (empty string if no continuity note applies)
   - "confidence": "high" (default if not set)
Do NOT omit these fields. Every action object must have an identical set of top-level keys.
```

**Why this fixes RC-5:** The global dedup pass is the last LLM-driven step before export. By adding normalization here, we guarantee schema uniformity without requiring changes to Phase A or Phase B (which would risk breaking their extraction behavior). Any downstream consumer — the Playwright compiler, the React timeline, or external tools — can rely on a stable field contract.

**Verification:**
- After processing, iterate all actions and assert every object contains the 5 normalized fields.
- No action should have `undefined` for any of these keys.

---

## Step 6 — Add a post-Phase-C linking coverage check

**Goal:** Detect and repair broken or missing action links before the pipeline completes, rather than discovering them in post-analysis.

**Target:** `server/jobManager.ts` — after the per-chunk loop completes and before Phase D.

**Spec:** Add a validation pass:

```typescript
// After all chunks are processed, before global dedup
addLog('info', 'Validating narrative-action link coverage...');

const allActionIds = new Set(cumulativeActions.map(a => a.id));
let brokenLinks = 0;
let unlinkedSteps = 0;

for (const step of cumulativeNarrative) {
  // Remove references to IDs that don't exist in the action set
  const validLinks = step.linked_visual_action_ids.filter((id: string) => allActionIds.has(id));
  const broken = step.linked_visual_action_ids.length - validLinks.length;
  brokenLinks += broken;
  step.linked_visual_action_ids = validLinks;

  if (validLinks.length === 0 && step.insight_type !== 'rationale') {
    unlinkedSteps++;
  }
}

const linkedActionIds = new Set(cumulativeNarrative.flatMap((s: NarrativeStep) => s.linked_visual_action_ids));
const userActions = cumulativeActions.filter(a => a.actor === 'user' && !a.is_error_recovery);
const unlinkedActions = userActions.filter(a => !linkedActionIds.has(a.id));

const coveragePercent = ((userActions.length - unlinkedActions.length) / userActions.length * 100).toFixed(1);
addLog('info', `Link coverage: ${coveragePercent}% of user actions linked. ${brokenLinks} broken refs removed. ${unlinkedSteps} non-rationale steps with no links.`);

if (unlinkedActions.length > userActions.length * 0.3) {
  addLog('warn', `Low link coverage (${coveragePercent}%). ${unlinkedActions.length} user actions have no narrative step.`);
}
```

**Why this is needed:** Even with Steps 1–5 implemented, LLM output is probabilistic. This check provides a quantitative quality signal in the logs. It also cleans up broken references that can occur if Phase D's global dedup reassigns action IDs after narration has already linked to the pre-dedup IDs.

**Additional fix for Phase D ID reassignment:** After the global dedup pass, if action IDs were reassigned (the dedup prompt instructs `Re-assign the "id" fields to be strictly sequential from "evt_001" to "evt_NNN"`), the narrative steps' `linked_visual_action_ids` will point to stale IDs. Add an ID remapping step:

```typescript
// After global dedup, remap narrative links
if (deduplicatedActions !== cumulativeActions) {
  const oldToNew = new Map<string, string>();
  
  // Build map by matching on timestamp + detail (since IDs were reassigned)
  for (const oldAction of cumulativeActions) {
    const match = deduplicatedActions.find(
      a => a.timestamp === oldAction.timestamp && a.detail === oldAction.detail
    );
    if (match && oldAction.id !== match.id) {
      oldToNew.set(oldAction.id, match.id);
    }
  }

  if (oldToNew.size > 0) {
    addLog('info', `Remapping ${oldToNew.size} narrative links after global dedup ID reassignment.`);
    for (const step of cumulativeNarrative) {
      step.linked_visual_action_ids = step.linked_visual_action_ids.map(
        (id: string) => oldToNew.get(id) ?? id
      );
    }
  }
}
```

**Verification:**
- Process any video and check the log for the coverage percentage line.
- Confirm zero broken links in the final output by asserting every ID in every step's `linked_visual_action_ids` exists in the `visual_actions` array.

---

## Execution Order

These steps have dependencies. Execute in this order:

1. **Step 2** (add `state_change` to simplified actions) — no dependencies, pure additive.
2. **Step 1** (widen action context window) — depends on Step 2 being in place so the wider context includes state transitions.
3. **Step 3** (tighten prompt Rule 7, add Rule 9) — independent of 1/2 but benefits from testing after they land.
4. **Step 4** (enforce insight_type enum) — independent, can be done in parallel.
5. **Step 5** (normalize fields in global dedup) — independent, can be done in parallel.
6. **Step 6** (coverage check + ID remapping) — must be last, as it validates the output of all previous steps.

Steps 4 and 5 can be implemented in parallel with Steps 1–3. Step 6 should be implemented last.

---

## Verification Protocol

After all steps are implemented, run the pipeline on at least 2 videos of different lengths and complexity:

**Short video (<5 min, single chunk):**
- [ ] ≥80% of `actor: "user"` actions are linked by at least one narrative step
- [ ] 0 narrative steps have `linked_visual_action_ids` referencing nonexistent action IDs
- [ ] 0 consecutive step pairs with synonymous intent within ≤10s
- [ ] Every step's `insight_type` is in the `InsightType` enum
- [ ] Every action has `interacted_components`, `input_data`, `is_error_recovery`, `context_note`, and `confidence` fields present

**Long video (>15 min, multiple chunks):**
- [ ] Same assertions as above
- [ ] No timestamp regression in narrative steps (monotonically increasing)
- [ ] No step ID collisions
- [ ] Steps spanning chunk boundaries correctly link to actions from both chunks
- [ ] Coverage check log line shows ≥80%

---

## Files Modified

| File | Steps | Nature of change |
|---|---|---|
| `server/jobManager.ts` | 1, 6 | Filter cumulative actions by clip window; add post-loop validation and ID remapping |
| `services/geminiService.ts` | 2, 4 | Enrich simplified action payload; verify schema enum enforcement |
| `constants.ts` | 3, 5 | Revise PASS_2 Rules 7/9; add normalization rule to GLOBAL_DEDUPLICATION_PROMPT |
