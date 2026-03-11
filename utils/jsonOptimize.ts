import { ActionItem, NarrativeStep, VideoAnnotation } from '../types';
import { parseMMSS } from './timeUtils';

/**
 * Replaces JSON.stringify(obj, null, 2) for all LLM-bound payloads.
 * Default indent: 1 saves ~50% of whitespace tokens vs indent: 2 while
 * preserving structural readability for the model's input parsing.
 */
export function compactStringify(obj: unknown, indent: number = 1): string {
  return JSON.stringify(obj, null, indent);
}

function compactInteractedComponents(components: any[]): string[] {
  return components.map((c: any) => {
    const parts = [c.type || '', c.label || ''];
    if (c.state_before && c.state_after) {
      parts.push(`${c.state_before}->${c.state_after}`);
    } else if (c.state_after) {
      parts.push(c.state_after);
    } else if (c.state_before) {
      parts.push(c.state_before);
    }
    return parts.join('|');
  });
}

/**
 * Removes keys where value is null, undefined, "", [], or {}.
 * Removes is_error_recovery: false from prompt copies.
 * Recursively cleans nested objects (including target, input_data, etc.).
 */
export function stripEmptyAndDefaults(obj: Record<string, any>): Record<string, any> {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
  
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined || value === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0) continue;
    
    // Remove is_error_recovery: false
    if (key === 'is_error_recovery' && value === false) continue;
    
    // Nested dict cleaning
    if (typeof value === 'object' && !Array.isArray(value)) {
      const nested = stripEmptyAndDefaults(value);
      if (Object.keys(nested).length > 0) {
        result[key] = nested;
      }
    } else {
      result[key] = value;
    }
  }
  return result;
}

export interface CleanOptions {
  keepConfidence?: boolean;
}

/**
 * Removes: confidence, chunkIndex, and target.spatial_bounding_box.
 * Applies to both actions and annotations.
 */
export function stripExtractionMeta(obj: any, options?: CleanOptions): any {
  if (!obj || typeof obj !== 'object') return obj;
  
  const result = { ...obj };
  if (!options?.keepConfidence) {
    delete result.confidence;
  }
  delete result.chunkIndex;
  delete result.ui_context;
  
  if (result.target && typeof result.target === 'object') {
    const targetCopy = { ...result.target };
    delete targetCopy.spatial_bounding_box;
    result.target = targetCopy;
  }
  
  return result;
}

/**
 * Combines stripExtractionMeta + stripEmptyAndDefaults in one call.
 * Does NOT compact interacted_components.
 */
export function cleanForPrompt(action: any, options?: CleanOptions): any {
  return stripEmptyAndDefaults(stripExtractionMeta(action, options));
}

/**
 * Denormalizes: Inlines each step's linked actions and annotations directly into the step object.
 * Strips: Cross-reference IDs, extraction metadata, empty/null/default fields.
 * Compacts: interacted_components from objects to pipe-delimited strings.
 * Preserves: Unlinked actions/annotations in separate top-level arrays.
 */
export function cleanFinalOutput(data: {
  actions: ActionItem[];
  annotations: VideoAnnotation[];
  narrativeSteps: NarrativeStep[];
  learnedContext?: string;
  metadata?: any;
}): { result: any; serializedSize: number } {
  const { actions, annotations, narrativeSteps, learnedContext, metadata } = data;
  
  const actionMap = new Map(actions.map(a => [a.id, a]));
  const annotationMap = new Map(annotations.map(a => [a.id, a]));
  
  const linkedActionIds = new Set<string>();
  const linkedAnnotationIds = new Set<string>();

  // --- Defensive sort: ensure steps are in timestamp order ---
  const sortedNarrativeSteps = [...narrativeSteps].sort((a, b) =>
    parseMMSS(a.timestamp) - parseMMSS(b.timestamp)
  );

  // --- Assign each action to exactly one step (closest timestamp wins) ---
  // Prevents physical duplication when multiple steps reference the same action.
  const actionOwnership = new Map<string, string>();

  // Pre-compute parsed timestamps for O(1) lookup during ownership resolution
  const stepTimestampMap = new Map<string, number>(
    sortedNarrativeSteps.map(s => [s.id, parseMMSS(s.timestamp)])
  );

  for (const step of sortedNarrativeSteps) {
    const stepTs = stepTimestampMap.get(step.id) ?? 0;
    for (const actionId of (step.linked_visual_action_ids || [])) {
      const action = actionMap.get(actionId);
      if (!action) continue;

      const actionTs = parseMMSS(action.timestamp);

      const existingOwner = actionOwnership.get(actionId);
      if (!existingOwner) {
        actionOwnership.set(actionId, step.id);
      } else {
        const existingTs = stepTimestampMap.get(existingOwner) ?? 0;
        const existingDist = Math.abs(existingTs - actionTs);
        const currentDist = Math.abs(stepTs - actionTs);
        // Strict < : on ties, the earlier step (processed first) keeps ownership
        if (currentDist < existingDist) {
          actionOwnership.set(actionId, step.id);
        }
      }
    }
  }

  const steps = sortedNarrativeSteps.map(step => {
    const stepCopy: any = { ...step };
    
    // Inline actions
    if (step.linked_visual_action_ids && step.linked_visual_action_ids.length > 0) {
      // Mark ALL referenced actions as linked (even those owned by other steps),
      // so they don't appear in unlinked_actions.
      for (const id of step.linked_visual_action_ids) {
        linkedActionIds.add(id);
      }

      // Only inline actions this step owns (prevents duplication)
      stepCopy.actions = step.linked_visual_action_ids
        .filter(id => actionOwnership.get(id) === step.id)
        .map(id => {
          const action = actionMap.get(id);
          if (!action) return null;

          let cleanedAction = cleanForPrompt(action);
          delete cleanedAction.id; // Strip cross-reference ID

          // Compact interacted_components
          if (cleanedAction.interacted_components && Array.isArray(cleanedAction.interacted_components)) {
            cleanedAction.interacted_components = compactInteractedComponents(cleanedAction.interacted_components);
          }
          return cleanedAction;
        })
        .filter(Boolean);
    }
    delete stepCopy.linked_visual_action_ids;
    
    // Inline annotations
    if (step.linked_annotation_ids && step.linked_annotation_ids.length > 0) {
      stepCopy.annotations = step.linked_annotation_ids
        .map(id => {
          linkedAnnotationIds.add(id);
          const ann = annotationMap.get(id);
          if (!ann) return null;
          
          let cleanedAnn = cleanForPrompt(ann);
          delete cleanedAnn.id; // Strip cross-reference ID
          return cleanedAnn;
        })
        .filter(Boolean);
    }
    delete stepCopy.linked_annotation_ids;
    
    delete stepCopy.id; // Strip step ID
    return stripEmptyAndDefaults(stepCopy);
  });
  
  const unlinked_actions = actions
    .filter(a => !linkedActionIds.has(a.id) && !a.is_error_recovery)
    .map(a => {
      let cleanedAction = cleanForPrompt(a);
      if (cleanedAction.interacted_components && Array.isArray(cleanedAction.interacted_components)) {
        cleanedAction.interacted_components = compactInteractedComponents(cleanedAction.interacted_components);
      }
      return cleanedAction;
    });
    
  const unlinked_annotations = annotations
    .filter(a => !linkedAnnotationIds.has(a.id))
    .map(a => cleanForPrompt(a));
    
  const rawResult: any = { steps };
  if (metadata && Object.keys(metadata).length > 0) {
    rawResult.metadata = metadata;
  }
  
  if (learnedContext) {
    rawResult.learnedContext = learnedContext;
  }
  if (unlinked_actions.length > 0) {
    rawResult.unlinked_actions = unlinked_actions;
  }
  if (unlinked_annotations.length > 0) {
    rawResult.unlinked_annotations = unlinked_annotations;
  }
  
  const result = stripEmptyAndDefaults(rawResult);
  const serialized = compactStringify(result);
  return { result, serializedSize: serialized.length };
}

/**
 * Strips actions from each step in already-cleaned output.
 * Returns the lightweight planning layer.
 */
export function extractSkeleton(cleanedData: any): any {
  if (!cleanedData || !cleanedData.steps) return cleanedData;
  
  const skeletonSteps = cleanedData.steps.map((step: any) => {
    const stepCopy = { ...step };
    delete stepCopy.actions;
    delete stepCopy.annotations;
    return stepCopy;
  });
  
  return {
    ...cleanedData,
    steps: skeletonSteps
  };
}

/**
 * Detects cross-chunk linking failure diagnosis.
 * A simple heuristic for cross-chunk linking failure based on global counts of empty steps and unlinked actions.
 */
export function detectUnlinkedActions(steps: NarrativeStep[], actions: ActionItem[]): {
  unlinked_count: number;
  unlinked_ids: string[];
  empty_steps: number;
  likely_linking_failure: boolean;
  diagnosis?: string;
} {
  const linkedIds = new Set<string>();
  const emptySteps: NarrativeStep[] = [];
  
  for (const step of steps) {
    if (!step.linked_visual_action_ids || step.linked_visual_action_ids.length === 0) {
      emptySteps.push(step);
    } else {
      for (const id of step.linked_visual_action_ids) {
        linkedIds.add(id);
      }
    }
  }
  
  const unlinkedActions = actions.filter(a => !linkedIds.has(a.id));
  const unlinkedIds = unlinkedActions.map(a => a.id);
  
  // Detect contiguous clusters of orphan actions
  const clusters: ActionItem[][] = [];
  let currentCluster: ActionItem[] = [];
  
  for (const action of actions) {
    if (!linkedIds.has(action.id)) {
      currentCluster.push(action);
    } else {
      if (currentCluster.length > 0) {
        clusters.push(currentCluster);
        currentCluster = [];
      }
    }
  }
  if (currentCluster.length > 0) {
    clusters.push(currentCluster);
  }

  // Check for temporal co-occurrence
  let likely_linking_failure = false;
  let maxCooccurringClusterSize = 0;
  
  for (const cluster of clusters) {
    if (cluster.length >= 3) {
      const clusterStart = parseMMSS(cluster[0].timestamp);
      const clusterEnd = parseMMSS(cluster[cluster.length - 1].timestamp);

      // Check if any empty step is near this cluster (e.g., within 30 seconds)
      for (const step of emptySteps) {
        const stepTime = parseMMSS(step.timestamp);
        if (stepTime >= clusterStart - 30 && stepTime <= clusterEnd + 30) {
          likely_linking_failure = true;
          if (cluster.length > maxCooccurringClusterSize) {
            maxCooccurringClusterSize = cluster.length;
          }
          break;
        }
      }
    }
  }
  
  let diagnosis;
  if (likely_linking_failure) {
    diagnosis = `Detected empty narrative steps co-occurring temporally with a contiguous cluster of ${maxCooccurringClusterSize} unlinked actions. This strongly suggests a cross-chunk ID linking failure.`;
  }
  
  return {
    unlinked_count: unlinkedIds.length,
    unlinked_ids: unlinkedIds,
    empty_steps: emptySteps.length,
    likely_linking_failure,
    diagnosis
  };
}

/**
 * Flags narrative steps with high topic/intent overlap using Jaccard similarity on non-stopword tokens.
 * Threshold: topic_overlap >= 0.6 OR intent_overlap >= 0.6 OR (both >= 0.3).
 */
export function detectRedundantSteps(steps: NarrativeStep[]): {index: number, duplicateOf: number}[] {
  const stopwords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'are', 'was', 'were', 'it', 'this', 'that']);
  
  const tokenize = (text: string) => {
    if (!text) return new Set<string>();
    const words = text.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/);
    return new Set(words.filter(w => w.length > 0 && !stopwords.has(w)));
  };
  
  const jaccard = (setA: Set<string>, setB: Set<string>) => {
    if (setA.size === 0 || setB.size === 0) return 0;
    const intersection = new Set([...setA].filter(x => setB.has(x)));
    const union = new Set([...setA, ...setB]);
    return intersection.size / union.size;
  };
  
  const redundancies: {index: number, duplicateOf: number}[] = [];
  
  for (let i = 0; i < steps.length; i++) {
    for (let j = 0; j < i; j++) {
      const intentA = tokenize(steps[i].intent);
      const intentB = tokenize(steps[j].intent);
      
      const topicsA = new Set((steps[i].topics || []).flatMap(t => [...tokenize(t)]));
      const topicsB = new Set((steps[j].topics || []).flatMap(t => [...tokenize(t)]));
      
      const intentOverlap = jaccard(intentA, intentB);
      const topicOverlap = jaccard(topicsA, topicsB);
      
      if (topicOverlap >= 0.6 || intentOverlap >= 0.6 || (topicOverlap >= 0.3 && intentOverlap >= 0.3)) {
        redundancies.push({ index: i, duplicateOf: j });
        break; // Only flag once per step
      }
    }
  }
  
  return redundancies;
}
