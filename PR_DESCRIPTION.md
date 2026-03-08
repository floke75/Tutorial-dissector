# Improve Narrative-Action Linking and Output Quality

## 🎯 Context & Symptoms
This PR implements the comprehensive fixes outlined in `IMPLEMENTATION_PLAN_NARRATIVE_ACTION_LINKING.md`. 

Previously, test runs exposed several critical defects in the execution graph:
- **Low Link Coverage:** ~58% of visual actions were never referenced by any narrative step because Phase C only saw the current chunk's actions.
- **Duplicate Steps:** The model generated intra-chunk near-duplicate steps (e.g., a conceptual step immediately followed by a mechanical step for the same activity).
- **Contradictory Narration:** The narration sometimes contradicted actual user actions because the model couldn't see underlying UI state transitions.
- **Inconsistent Schemas:** Optional fields (`interacted_components`, `input_data`) were inconsistently present across visual actions, and `insight_type` drifted from its defined enum values.

## ✨ Key Changes

### 1. Widened Action Context Window (Phase C)
- **File:** `server/jobManager.ts`
- **Change:** Phase C now receives a time-filtered slice of `cumulativeActions` (buffered by 15 seconds) rather than just the current chunk's actions.
- **Impact:** Narrative steps can now successfully link to actions across chunk boundaries, drastically improving link coverage.

### 2. State Transition Grounding
- **File:** `services/geminiService.ts`
- **Change:** Enriched the `simplifiedActions` payload sent to the narration model by adding a `state_change` summary derived from `interacted_components` (e.g., `{ label: "Setting", from: "unchecked", to: "checked" }`).
- **Impact:** The model now has ground-truth data on what the user *actually changed*, preventing narration from contradicting the mechanical UI state.

### 3. Prompt Refinements (Duplicate Prevention)
- **File:** `constants.ts`
- **Change:** Tightened `PASS_2_SYSTEM_PROMPT`. Revised Rule 7 to make standalone conceptual steps conditional (only if no adjacent linked step exists) and added Rule 9 to explicitly forbid consecutive steps with synonymous intents.
- **Impact:** Eliminates redundant intra-chunk narrative steps.

### 4. Strict Schema Enforcement
- **File:** `services/geminiService.ts`
- **Change:** Enforced `insight_type` strictly via a Zod enum in the `responseSchema`.
- **Impact:** Prevents the model from hallucinating invalid insight types (e.g., "instructional").

### 5. Global Deduplication Normalization
- **File:** `constants.ts`
- **Change:** Added a schema normalization rule to `GLOBAL_DEDUPLICATION_PROMPT` to enforce default values for `interacted_components`, `input_data`, `is_error_recovery`, `context_note`, and `confidence`.
- **Impact:** Guarantees a stable, uniform field contract for all downstream consumers (Playwright compiler, React timeline).

### 6. Coverage Validation & Link Remapping
- **File:** `server/jobManager.ts`
- **Change:** Added a post-Phase-C validation pass that calculates link coverage, logs warnings if coverage drops below 70%, and prunes broken references. Also added logic to remap `linked_visual_action_ids` if Phase D (Global Dedup) reassigns action IDs.
- **Impact:** Detects and repairs broken links automatically before the pipeline completes.

## 🧪 Verification Protocol
Reviewers should verify the following on test runs (both short and long videos):
- [ ] **Coverage:** ≥80% of `actor: "user"` actions are linked by at least one narrative step.
- [ ] **Integrity:** 0 narrative steps have `linked_visual_action_ids` referencing nonexistent action IDs.
- [ ] **Deduplication:** 0 consecutive step pairs with synonymous intent within ≤10s.
- [ ] **Schema:** Every step's `insight_type` strictly matches the `InsightType` enum, and every action has all normalized fields present.
