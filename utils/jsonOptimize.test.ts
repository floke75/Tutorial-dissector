import { describe, it, expect } from 'vitest';
import { cleanFinalOutput } from './jsonOptimize';
import type { ActionItem, NarrativeStep, VideoAnnotation } from '../types';

// Minimal factory helpers
function makeAction(overrides: Partial<ActionItem> & { id: string; timestamp: string }): ActionItem {
  return {
    action_type: 'click',
    actor: 'user',
    detail: 'test action',
    result: null,
    context_note: null,
    confidence: 'high',
    ...overrides,
  };
}

function makeStep(overrides: Partial<NarrativeStep> & { id: string; timestamp: string }): NarrativeStep {
  return {
    intent: 'test intent',
    precondition: 'none',
    explanation: 'test explanation',
    postcondition: 'done',
    insight_type: 'explanation',
    topics: ['test'],
    linked_visual_action_ids: [],
    ...overrides,
  };
}

describe('cleanFinalOutput', () => {
  it('basic 1:1 inlining — each step gets its own action', () => {
    const actions = [
      makeAction({ id: 'a1', timestamp: '0:10', detail: 'click save' }),
      makeAction({ id: 'a2', timestamp: '0:30', detail: 'click open' }),
    ];
    const steps = [
      makeStep({ id: 's1', timestamp: '0:10', linked_visual_action_ids: ['a1'] }),
      makeStep({ id: 's2', timestamp: '0:30', linked_visual_action_ids: ['a2'] }),
    ];

    const { result } = cleanFinalOutput({ actions, annotations: [], narrativeSteps: steps });

    expect(result.steps).toHaveLength(2);
    expect(result.steps[0].actions).toHaveLength(1);
    expect(result.steps[0].actions[0].detail).toBe('click save');
    expect(result.steps[1].actions).toHaveLength(1);
    expect(result.steps[1].actions[0].detail).toBe('click open');
    // No unlinked actions
    expect(result.unlinked_actions).toBeUndefined();
  });

  it('multi-linked dedup — action appears in exactly one step (closest timestamp)', () => {
    const actions = [
      makeAction({ id: 'a1', timestamp: '0:20', detail: 'shared action' }),
    ];
    const steps = [
      makeStep({ id: 's1', timestamp: '0:10', linked_visual_action_ids: ['a1'] }),
      makeStep({ id: 's2', timestamp: '0:25', linked_visual_action_ids: ['a1'] }),
    ];

    const { result } = cleanFinalOutput({ actions, annotations: [], narrativeSteps: steps });

    // Action at 0:20 is closer to step at 0:25 (dist=5) than step at 0:10 (dist=10)
    const allActions = result.steps.flatMap((s: any) => s.actions || []);
    expect(allActions).toHaveLength(1);
    expect(result.steps[0].actions).toBeUndefined(); // s1 doesn't own it
    expect(result.steps[1].actions).toHaveLength(1);
    expect(result.steps[1].actions[0].detail).toBe('shared action');
    // Multi-linked action should NOT appear in unlinked
    expect(result.unlinked_actions).toBeUndefined();
  });

  it('timestamp sort — output steps are ordered by timestamp regardless of input order', () => {
    const actions = [
      makeAction({ id: 'a1', timestamp: '1:30' }),
      makeAction({ id: 'a2', timestamp: '0:45' }),
      makeAction({ id: 'a3', timestamp: '2:00' }),
    ];
    const steps = [
      makeStep({ id: 's1', timestamp: '1:30', linked_visual_action_ids: ['a1'] }),
      makeStep({ id: 's2', timestamp: '0:45', linked_visual_action_ids: ['a2'] }),
      makeStep({ id: 's3', timestamp: '2:00', linked_visual_action_ids: ['a3'] }),
    ];

    const { result } = cleanFinalOutput({ actions, annotations: [], narrativeSteps: steps });

    expect(result.steps[0].timestamp).toBe('0:45');
    expect(result.steps[1].timestamp).toBe('1:30');
    expect(result.steps[2].timestamp).toBe('2:00');
  });

  it('missing timestamp — does not crash; action assigned to referencing step', () => {
    const actions = [
      makeAction({ id: 'a1', timestamp: '' }),
    ];
    const steps = [
      makeStep({ id: 's1', timestamp: '', linked_visual_action_ids: ['a1'] }),
    ];

    const { result } = cleanFinalOutput({ actions, annotations: [], narrativeSteps: steps });

    expect(result.steps).toHaveLength(1);
    const allActions = result.steps.flatMap((s: any) => s.actions || []);
    expect(allActions).toHaveLength(1);
  });

  it('unlinked preservation — unreferenced actions appear in unlinked_actions', () => {
    const actions = [
      makeAction({ id: 'a1', timestamp: '0:10' }),
      makeAction({ id: 'a2', timestamp: '0:20' }),
      makeAction({ id: 'a3', timestamp: '0:30' }),
    ];
    const steps = [
      makeStep({ id: 's1', timestamp: '0:10', linked_visual_action_ids: ['a1', 'a2'] }),
    ];

    const { result } = cleanFinalOutput({ actions, annotations: [], narrativeSteps: steps });

    expect(result.unlinked_actions).toHaveLength(1);
    expect(result.unlinked_actions[0].detail).toBe('test action');
    expect(result.unlinked_actions[0].timestamp).toBe('0:30');
  });

  it('ownership tiebreak — equidistant action goes to earlier step', () => {
    // Action at 1:00 (60s), steps at 0:50 (50s) and 1:10 (70s) — both dist=10
    const actions = [
      makeAction({ id: 'a1', timestamp: '1:00', detail: 'tied action' }),
    ];
    const steps = [
      makeStep({ id: 's1', timestamp: '0:50', linked_visual_action_ids: ['a1'] }),
      makeStep({ id: 's2', timestamp: '1:10', linked_visual_action_ids: ['a1'] }),
    ];

    const { result } = cleanFinalOutput({ actions, annotations: [], narrativeSteps: steps });

    // Earlier step (0:50) wins ties
    const allActions = result.steps.flatMap((s: any) => s.actions || []);
    expect(allActions).toHaveLength(1);
    expect(result.steps[0].actions).toHaveLength(1);
    expect(result.steps[0].actions[0].detail).toBe('tied action');
  });

  it('IDs are stripped from output steps and actions', () => {
    const actions = [
      makeAction({ id: 'a1', timestamp: '0:10' }),
    ];
    const steps = [
      makeStep({ id: 's1', timestamp: '0:10', linked_visual_action_ids: ['a1'] }),
    ];

    const { result } = cleanFinalOutput({ actions, annotations: [], narrativeSteps: steps });

    expect(result.steps[0].id).toBeUndefined();
    expect(result.steps[0].linked_visual_action_ids).toBeUndefined();
    expect(result.steps[0].actions[0].id).toBeUndefined();
  });

  it('error recovery actions excluded from unlinked_actions', () => {
    const actions = [
      makeAction({ id: 'a1', timestamp: '0:10', is_error_recovery: true }),
    ];
    const steps: NarrativeStep[] = [];

    const { result } = cleanFinalOutput({ actions, annotations: [], narrativeSteps: steps });

    expect(result.unlinked_actions).toBeUndefined();
  });

  it('extraction metadata is stripped (confidence, chunkIndex, ui_context, spatial_bounding_box)', () => {
    const actions = [
      makeAction({
        id: 'a1',
        timestamp: '0:10',
        confidence: 'high',
        chunkIndex: 2,
        ui_context: { active_panel: 'main', active_tool: 'select', open_dialogs: [] },
        target: {
          element: 'button',
          location: 'toolbar',
          panel: 'main',
          visual: 'blue button',
          spatial_bounding_box: [100, 200, 300, 400],
        },
      }),
    ];
    const steps = [
      makeStep({ id: 's1', timestamp: '0:10', linked_visual_action_ids: ['a1'] }),
    ];

    const { result } = cleanFinalOutput({ actions, annotations: [], narrativeSteps: steps });

    const inlinedAction = result.steps[0].actions[0];
    expect(inlinedAction.confidence).toBeUndefined();
    expect(inlinedAction.chunkIndex).toBeUndefined();
    expect(inlinedAction.ui_context).toBeUndefined();
    expect(inlinedAction.target.spatial_bounding_box).toBeUndefined();
    // Preserved fields
    expect(inlinedAction.target.element).toBe('button');
  });
});
