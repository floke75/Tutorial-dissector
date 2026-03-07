import json
import sys
import re

def parse_time(ts):
    if not ts: return 0
    parts = ts.split(':')
    if len(parts) == 2:
        return int(parts[0]) * 60 + int(parts[1])
    elif len(parts) == 3:
        return int(parts[0]) * 3600 + int(parts[1]) * 60 + int(parts[2])
    return 0

def format_time(seconds):
    m = seconds // 60
    s = seconds % 60
    return f"{m:02d}:{s:02d}"

def tokenize(text):
    if not text: return set()
    text = text.lower()
    words = re.findall(r'\b\w+\b', text)
    stopwords = {"the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for", "of", "with", "by", "is", "it", "this", "that"}
    return set(w for w in words if w not in stopwords)

def levenshtein_distance(s1, s2):
    if len(s1) < len(s2):
        return levenshtein_distance(s2, s1)
    if len(s2) == 0:
        return len(s1)
    previous_row = range(len(s2) + 1)
    for i, c1 in enumerate(s1):
        current_row = [i + 1]
        for j, c2 in enumerate(s2):
            insertions = previous_row[j + 1] + 1
            deletions = current_row[j] + 1
            substitutions = previous_row[j] + (c1 != c2)
            current_row.append(min(insertions, deletions, substitutions))
        previous_row = current_row
    return previous_row[-1]

def normalized_edit_distance(s1, s2):
    if not s1 and not s2: return 1.0
    if not s1 or not s2: return 0.0
    dist = levenshtein_distance(s1.lower(), s2.lower())
    max_len = max(len(s1), len(s2))
    return 1.0 - (dist / max_len)

def get_sentences(text):
    return [s.strip() for s in re.split(r'(?<=[.!?])\s+', text) if s.strip()]

def main():
    if len(sys.argv) != 3:
        print("Usage: python postprocess.py input.json output.json", file=sys.stderr)
        sys.exit(1)
        
    input_file = sys.argv[1]
    output_file = sys.argv[2]
    
    with open(input_file, 'r', encoding='utf-8') as f:
        data = json.load(f)
        
    visual_actions = data.get("visual_actions", [])
    narrative_steps = data.get("narrative_steps", [])
    
    # 1. Extract chunk boundaries
    chunks = data.get("chunks", [])
    new_visual_actions = [a for a in visual_actions if a.get("action_type") != "chunk_boundary"]

    # 2. Deduplicate visual actions
    new_visual_actions.sort(key=lambda a: parse_time(a.get("timestamp", "00:00")))
    dedup_map = {}
    kept_actions = []
    
    for action in new_visual_actions:
        action_time = parse_time(action.get("timestamp", "00:00"))
        is_duplicate = False
        
        for kept in reversed(kept_actions):
            kept_time = parse_time(kept.get("timestamp", "00:00"))
            if action_time - kept_time > 2:
                break
                
            if abs(action_time - kept_time) <= 2:
                if action.get("action_type") == kept.get("action_type") and action.get("actor") == kept.get("actor"):
                    target1 = action.get("target", {}).get("element", "") if isinstance(action.get("target"), dict) else ""
                    target2 = kept.get("target", {}).get("element", "") if isinstance(kept.get("target"), dict) else ""
                    
                    sim = normalized_edit_distance(target1, target2)
                    
                    if sim > 0.85 or (target1 and target1 == target2):
                        def score(a):
                            s = sum(1 for v in a.values() if v not in (None, "", []))
                            s += len(a.get("detail", "")) * 0.01
                            return s
                        
                        if score(action) > score(kept):
                            dedup_map[kept["id"]] = action["id"]
                            for k, v in dedup_map.items():
                                if v == kept["id"]:
                                    dedup_map[k] = action["id"]
                            kept.clear()
                            kept.update(action)
                        else:
                            dedup_map[action["id"]] = kept["id"]
                        
                        is_duplicate = True
                        break
                        
        if not is_duplicate:
            kept_actions.append(action)
            
    final_visual_actions = kept_actions
    
    # Update linked_visual_action_ids
    for step in narrative_steps:
        if "linked_visual_action_ids" in step:
            new_links = []
            for link in step["linked_visual_action_ids"]:
                mapped_link = dedup_map.get(link, link)
                if mapped_link not in new_links:
                    new_links.append(mapped_link)
            step["linked_visual_action_ids"] = new_links

    # 3. Merge overlapping narrative steps
    def get_step_time(step):
        return parse_time(step.get("timestamp", "00:00"))

    chunk_idx = 0
    last_ts = -1
    for step in narrative_steps:
        ts = get_step_time(step)
        step_id = step.get("id", "")
        if step_id == "step_001" or ts < last_ts - 5:
            chunk_idx += 1
        step["_chunk_idx"] = chunk_idx
        last_ts = ts
        
    narrative_steps.sort(key=get_step_time)
    
    merged_steps = []
    for step in narrative_steps:
        step_time = get_step_time(step)
        merged = False
        
        for kept in reversed(merged_steps):
            kept_time = get_step_time(kept)
            if step_time - kept_time > 10:
                break
                
            chunk_diff = step.get("_chunk_idx", -1) != kept.get("_chunk_idx", -2)
            links_step = set(step.get("linked_visual_action_ids", []))
            links_kept = set(kept.get("linked_visual_action_ids", []))
            overlap_links = len(links_step.intersection(links_kept)) > 0
            
            tok_step = tokenize(step.get("intent", ""))
            tok_kept = tokenize(kept.get("intent", ""))
            shared_tokens = len(tok_step.intersection(tok_kept))
            
            if abs(step_time - kept_time) <= 10:
                # Special case: empty linked_visual_action_ids
                if not links_step and links_kept:
                    base_exp = kept.get("explanation", "")
                    drop_exp = step.get("explanation", "")
                    base_sents = set(get_sentences(base_exp))
                    drop_sents = get_sentences(drop_exp)
                    new_sents = [s for s in drop_sents if s not in base_sents]
                    if new_sents:
                        kept["explanation"] = (base_exp + " " + " ".join(new_sents)).strip()
                    
                    kept_orig = kept.get("original_ids", [kept.get("id")]) if "original_ids" not in kept else kept["original_ids"]
                    step_orig = step.get("original_ids", [step.get("id")]) if "original_ids" not in step else step["original_ids"]
                    kept["original_ids"] = list(dict.fromkeys(kept_orig + step_orig))
                    merged = True
                    break
                elif not links_kept and links_step:
                    base_exp = step.get("explanation", "")
                    drop_exp = kept.get("explanation", "")
                    base_sents = set(get_sentences(base_exp))
                    drop_sents = get_sentences(drop_exp)
                    new_sents = [s for s in drop_sents if s not in base_sents]
                    if new_sents:
                        step["explanation"] = (base_exp + " " + " ".join(new_sents)).strip()
                    
                    step_orig = step.get("original_ids", [step.get("id")]) if "original_ids" not in step else step["original_ids"]
                    kept_orig = kept.get("original_ids", [kept.get("id")]) if "original_ids" not in kept else kept["original_ids"]
                    step["original_ids"] = list(dict.fromkeys(step_orig + kept_orig))
                    
                    kept.clear()
                    kept.update(step)
                    merged = True
                    break
                
                # Normal merge
                if (chunk_diff or overlap_links or "original_ids" in step) and (overlap_links or shared_tokens >= 2):
                    if len(links_step) > len(links_kept):
                        base, drop = step, kept
                    else:
                        base, drop = kept, step
                    
                    base["linked_visual_action_ids"] = list(dict.fromkeys(base.get("linked_visual_action_ids", []) + drop.get("linked_visual_action_ids", [])))
                    
                    base_exp = base.get("explanation", "")
                    drop_exp = drop.get("explanation", "")
                    base_sents = set(get_sentences(base_exp))
                    drop_sents = get_sentences(drop_exp)
                    new_sents = [s for s in drop_sents if s not in base_sents]
                    if new_sents:
                        base["explanation"] = (base_exp + " " + " ".join(new_sents)).strip()
                        
                    if len(drop.get("intent", "")) > len(base.get("intent", "")):
                        base["intent"] = drop.get("intent", "")
                        
                    base["topics"] = list(dict.fromkeys(base.get("topics", []) + drop.get("topics", [])))
                    
                    base_orig = base.get("original_ids", [base.get("id")]) if "original_ids" not in base else base["original_ids"]
                    drop_orig = drop.get("original_ids", [drop.get("id")]) if "original_ids" not in drop else drop["original_ids"]
                    base["original_ids"] = list(dict.fromkeys(base_orig + drop_orig))
                    
                    kept.clear()
                    kept.update(base)
                    merged = True
                    break
                    
        if not merged:
            if not step.get("linked_visual_action_ids"):
                step["narration_only"] = True
            if "original_ids" not in step:
                step["original_ids"] = [step.get("id")]
            merged_steps.append(step)
            
    # 4. Assign globally unique IDs
    for i, step in enumerate(merged_steps):
        step["id"] = f"step_{i+1:03d}"
        if "_chunk_idx" in step:
            del step["_chunk_idx"]
            
    # 5. Add time ranges
    action_times = {a["id"]: parse_time(a.get("timestamp", "00:00")) for a in final_visual_actions}
    for step in merged_steps:
        links = step.get("linked_visual_action_ids", [])
        if links:
            times = [action_times[lid] for lid in links if lid in action_times]
            if times:
                start_ts = min(times)
                end_ts = max(times)
            else:
                start_ts = get_step_time(step)
                end_ts = start_ts
        else:
            start_ts = get_step_time(step)
            end_ts = start_ts
            
        step["timestamp"] = format_time(start_ts)
            
    # 6. Normalize insight_type
    insight_map = {
        "workflow": "workflow_framing",
        "action": "explanation",
        "instructional": "explanation",
        "rationale": "rationale",
        "conceptual": "explanation",
        "ui_customization": "tip",
        "procedural": "explanation",
        "comparison": "comparison",
        "warning": "warning"
    }
    for step in merged_steps:
        itype = step.get("insight_type", "").lower()
        step["insight_type"] = insight_map.get(itype, "explanation")
        
    # 7. Update metadata
    metadata = data.get("metadata", {})
    
    steps_before = len(narrative_steps)
    actions_before = len(visual_actions)
    steps_after = len(merged_steps)
    actions_after = len(final_visual_actions)
    
    metadata["total_steps"] = steps_after
    metadata["total_actions"] = actions_after
    metadata["total_chunks"] = len(chunks)
    
    if "dedup_stats" not in metadata:
        metadata["dedup_stats"] = {
            "steps_before": steps_before,
            "steps_after": steps_after,
            "steps_merged": steps_before - steps_after,
            "actions_before": actions_before,
            "actions_after": actions_after,
            "actions_deduped": len(new_visual_actions) - actions_after,
            "narration_only_steps": sum(1 for s in merged_steps if s.get("narration_only"))
        }
    else:
        metadata["dedup_stats"]["steps_after"] = steps_after
        metadata["dedup_stats"]["actions_after"] = actions_after
        metadata["dedup_stats"]["narration_only_steps"] = sum(1 for s in merged_steps if s.get("narration_only"))
        
    data["metadata"] = metadata
    data["chunks"] = chunks
    data["narrative_steps"] = merged_steps
    data["visual_actions"] = final_visual_actions
    
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2)
        
    print(f"Processed {input_file} -> {output_file}", file=sys.stderr)
    print(f"Steps: {steps_before} -> {steps_after} ({steps_before - steps_after} merged)", file=sys.stderr)
    print(f"Actions: {actions_before} -> {actions_after} ({len(new_visual_actions) - actions_after} deduped, {actions_before - len(new_visual_actions)} boundaries removed)", file=sys.stderr)

if __name__ == "__main__":
    main()
