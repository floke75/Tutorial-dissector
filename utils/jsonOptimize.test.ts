import { describe, it, expect } from 'vitest';
import { cleanFinalOutput } from './jsonOptimize';
import type { ActionItem, NarrativeStep, VideoAnnotation } from '../types';

describe('cleanFinalOutput', () => {
  it('Basic inlining: 2 steps, 2 actions, 1:1 linking', () => {
    const actions: ActionItem[] = [
      { id: 'a1', timestamp: '0:10', action_type: 'click', detail: 'click 1' },
      { id: 'a2', timestamp: '0:20', action_type: 'type', detail: 'type 1' }
    ];
    const steps: NarrativeStep[] = [
      { id: 's1', timestamp: '0:10', explanation: 'step 1', linked_visual_action_ids: ['a1'], insight_type: 'procedural' },
      { id: 's2', timestamp: '0:20', explanation: 'step 2', linked_visual_action_ids: ['a2'], insight_type: 'procedural' }
    ];

    const { result } = cleanFinalOutput({ actions, annotations: [], narrativeSteps: steps });

    expect(result.steps.length).toBe(2);
    expect(result.steps[0].actions.length).toBe(1);
    expect(result.steps[0].actions[0].action_type).toBe('click');
    expect(result.steps[1].actions.length).toBe(1);
    expect(result.steps[1].actions[0].action_type).toBe('type');
    expect(result.unlinked_actions).toBeUndefined(); // or empty array if handled differently, but stripEmptyAndDefaults removes empty arrays
  });

  it('Multi-linked dedup: 2 steps both referencing action A', () => {
    const actions: ActionItem[] = [
      { id: 'a1', timestamp: '0:15', action_type: 'click', detail: 'click 1' }
    ];
    const steps: NarrativeStep[] = [
      { id: 's1', timestamp: '0:10', explanation: 'step 1', linked_visual_action_ids: ['a1'], insight_type: 'procedural' },
      { id: 's2', timestamp: '0:20', explanation: 'step 2', linked_visual_action_ids: ['a1'], insight_type: 'procedural' }
    ];

    const { result } = cleanFinalOutput({ actions, annotations: [], narrativeSteps: steps });

    expect(result.steps.length).toBe(2);
    // a1 is at 0:15, s1 is 0:10 (dist 5), s2 is 0:20 (dist 5). Tie goes to earlier step (s1).
    expect(result.steps[0].actions.length).toBe(1);
    expect(result.steps[0].actions[0].action_type).toBe('click');
    expect(result.steps[1].actions).toBeUndefined(); // Empty array stripped
  });

  it('Timestamp sort: Steps at ["1:30", "0:45", "2:00"]', () => {
    const steps: NarrativeStep[] = [
      { id: 's1', timestamp: '1:30', explanation: 'step 1', linked_visual_action_ids: [], insight_type: 'procedural' },
      { id: 's2', timestamp: '0:45', explanation: 'step 2', linked_visual_action_ids: [], insight_type: 'procedural' },
      { id: 's3', timestamp: '2:00', explanation: 'step 3', linked_visual_action_ids: [], insight_type: 'procedural' }
    ];

    const { result } = cleanFinalOutput({ actions: [], annotations: [], narrativeSteps: steps });

    expect(result.steps.length).toBe(3);
    expect(result.steps[0].timestamp).toBe('0:45');
    expect(result.steps[1].timestamp).toBe('1:30');
    expect(result.steps[2].timestamp).toBe('2:00');
  });

  it('Missing timestamp: Step with empty timestamp, action with empty timestamp', () => {
    const actions: ActionItem[] = [
      { id: 'a1', timestamp: '', action_type: 'click', detail: 'click 1' }
    ];
    const steps: NarrativeStep[] = [
      { id: 's1', timestamp: '', explanation: 'step 1', linked_visual_action_ids: ['a1'], insight_type: 'procedural' }
    ];

    const { result } = cleanFinalOutput({ actions, annotations: [], narrativeSteps: steps });

    expect(result.steps.length).toBe(1);
    expect(result.steps[0].actions.length).toBe(1);
    expect(result.steps[0].actions[0].action_type).toBe('click');
  });

  it('Unlinked preservation: 3 actions, only 2 linked', () => {
    const actions: ActionItem[] = [
      { id: 'a1', timestamp: '0:10', action_type: 'click', detail: 'click 1' },
      { id: 'a2', timestamp: '0:20', action_type: 'type', detail: 'type 1' },
      { id: 'a3', timestamp: '0:30', action_type: 'scroll', detail: 'scroll 1' }
    ];
    const steps: NarrativeStep[] = [
      { id: 's1', timestamp: '0:10', explanation: 'step 1', linked_visual_action_ids: ['a1', 'a2'], insight_type: 'procedural' }
    ];

    const { result } = cleanFinalOutput({ actions, annotations: [], narrativeSteps: steps });

    expect(result.steps.length).toBe(1);
    expect(result.steps[0].actions.length).toBe(2);
    expect(result.unlinked_actions.length).toBe(1);
    expect(result.unlinked_actions[0].action_type).toBe('scroll');
  });

  it('Ownership tiebreak: Action at 1:00, steps at 0:50 and 1:10', () => {
    const actions: ActionItem[] = [
      { id: 'a1', timestamp: '1:00', action_type: 'click', detail: 'click 1' }
    ];
    const steps: NarrativeStep[] = [
      { id: 's1', timestamp: '0:50', explanation: 'step 1', linked_visual_action_ids: ['a1'], insight_type: 'procedural' },
      { id: 's2', timestamp: '1:10', explanation: 'step 2', linked_visual_action_ids: ['a1'], insight_type: 'procedural' }
    ];

    const { result } = cleanFinalOutput({ actions, annotations: [], narrativeSteps: steps });

    expect(result.steps.length).toBe(2);
    expect(result.steps[0].actions.length).toBe(1);
    expect(result.steps[1].actions).toBeUndefined();
  });

  it('IDs stripped: 1 step, 1 action', () => {
    const actions: ActionItem[] = [
      { id: 'a1', timestamp: '0:10', action_type: 'click', detail: 'click 1' }
    ];
    const steps: NarrativeStep[] = [
      { id: 's1', timestamp: '0:10', explanation: 'step 1', linked_visual_action_ids: ['a1'], insight_type: 'procedural' }
    ];

    const { result } = cleanFinalOutput({ actions, annotations: [], narrativeSteps: steps });

    expect(result.steps.length).toBe(1);
    expect(result.steps[0].id).toBeUndefined();
    expect(result.steps[0].actions[0].id).toBeUndefined();
  });

  it('Unlinked error recovery excluded', () => {
    const actions: ActionItem[] = [
      { id: 'a1', timestamp: '0:10', action_type: 'click', detail: 'click 1', is_error_recovery: true }
    ];
    const steps: NarrativeStep[] = [];

    const { result } = cleanFinalOutput({ actions, annotations: [], narrativeSteps: steps });

    expect(result.unlinked_actions).toBeUndefined(); // Filtered out
  });

  it('Linked error recovery inlined', () => {
    const actions: ActionItem[] = [
      { id: 'a1', timestamp: '0:10', action_type: 'click', detail: 'click 1', is_error_recovery: true }
    ];
    const steps: NarrativeStep[] = [
      { id: 's1', timestamp: '0:10', explanation: 'step 1', linked_visual_action_ids: ['a1'], insight_type: 'procedural' }
    ];

    const { result } = cleanFinalOutput({ actions, annotations: [], narrativeSteps: steps });

    expect(result.steps.length).toBe(1);
    expect(result.steps[0].actions.length).toBe(1);
    expect(result.steps[0].actions[0].is_error_recovery).toBe(true);
  });

  it('Metadata stripped', () => {
    const actions: ActionItem[] = [
      { 
        id: 'a1', timestamp: '0:10', action_type: 'click', detail: 'click 1', 
        confidence: 'high', chunkIndex: 1, ui_context: 'context', 
        target: { element: 'button', spatial_bounding_box: [0, 0, 10, 10] } 
      }
    ];
    const steps: NarrativeStep[] = [
      { id: 's1', timestamp: '0:10', explanation: 'step 1', linked_visual_action_ids: ['a1'], insight_type: 'procedural' }
    ];

    const { result } = cleanFinalOutput({ actions, annotations: [], narrativeSteps: steps });

    expect(result.steps.length).toBe(1);
    const action = result.steps[0].actions[0];
    expect(action.confidence).toBeUndefined();
    expect(action.chunkIndex).toBeUndefined();
    expect(action.ui_context).toBeUndefined();
    expect(action.target.spatial_bounding_box).toBeUndefined();
  });
});
