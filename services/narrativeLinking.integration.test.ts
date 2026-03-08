import { describe, it, expect } from 'vitest';
import { analyzeNarrationSegment, analyzeGlobalDeduplication } from './geminiService';
import { ActionItem, VideoAnnotation, NarrativeStep } from '../types';

const apiKey = process.env.GEMINI_API_KEY;

describe('Narrative Linking & Output Quality Integration Tests', () => {
  it('should generate valid narrative steps with correct schema and insight types', async () => {
    if (!apiKey) {
      console.warn('Skipping live Gemini test because GEMINI_API_KEY is not set.');
      return;
    }

    const videoUrl = 'https://youtu.be/RHx-PGeh9xk';
    const startSec = 0;
    const endSec = 30;

    // Mock some Phase B actions with state transitions
    const mockActions: ActionItem[] = [
      {
        id: 'evt_001',
        timestamp: '00:05',
        action_type: 'click',
        actor: 'user',
        target: { element: 'Settings Button', location: 'Top Right', panel: 'Header', visual: 'Gear icon' },
        detail: 'User clicked the settings button',
        result: 'Settings menu opened',
        context_note: '',
        confidence: 'high',
        interacted_components: [
          { type: 'button', label: 'Settings', state_before: 'default', state_after: 'active' }
        ]
      },
      {
        id: 'evt_002',
        timestamp: '00:10',
        action_type: 'click',
        actor: 'user',
        target: { element: 'Dark Mode Toggle', location: 'Menu', panel: 'Settings', visual: 'Toggle switch' },
        detail: 'User toggled dark mode',
        result: 'Theme changed to dark',
        context_note: '',
        confidence: 'high',
        interacted_components: [
          { type: 'toggle', label: 'Dark Mode', state_before: 'unchecked', state_after: 'checked' }
        ]
      }
    ];

    const mockAnnotations: VideoAnnotation[] = [];

    console.log(`\n🚀 Starting live Phase C analysis...`);
    
    const { steps, learned_insights } = await analyzeNarrationSegment(
      videoUrl,
      startSec,
      endSec,
      mockActions,
      mockAnnotations,
      'This is a test context.',
      apiKey,
      [],
      (level, msg) => console.log(`[${level.toUpperCase()}] ${msg}`)
    );

    console.log(`\n✅ --- PHASE C RESULTS ---`);
    console.log(`Generated ${steps.length} narrative steps.`);
    console.log(`Learned Insights: ${learned_insights}`);
    
    expect(Array.isArray(steps)).toBe(true);
    
    const validInsightTypes = ['explanation', 'rationale', 'tip', 'warning', 'workflow_framing', 'comparison'];
    
    for (const step of steps) {
      expect(step).toHaveProperty('id');
      expect(step).toHaveProperty('intent');
      expect(step).toHaveProperty('insight_type');
      expect(validInsightTypes).toContain(step.insight_type);
      expect(Array.isArray(step.linked_visual_action_ids)).toBe(true);
    }
    
    // Check if at least one step linked to our mock actions
    const linkedIds = new Set(steps.flatMap(s => s.linked_visual_action_ids));
    expect(linkedIds.size).toBeGreaterThan(0);
  }, 120000);

  it('should normalize fields during global deduplication', async () => {
    if (!apiKey) {
      console.warn('Skipping live Gemini test because GEMINI_API_KEY is not set.');
      return;
    }

    // Create a mock action missing optional fields
    const unnormalizedAction: any = {
      id: 'evt_001',
      timestamp: '00:05',
      action_type: 'click',
      actor: 'user',
      target: { element: 'Button', location: 'Center', panel: 'Main', visual: 'Blue button' },
      detail: 'User clicked button',
      result: 'Action performed'
      // Missing: interacted_components, input_data, is_error_recovery, context_note, confidence
    };

    console.log(`\n🚀 Starting live Phase D (Global Dedup) analysis...`);
    
    const deduplicated_actions = await analyzeGlobalDeduplication(
      [unnormalizedAction],
      [],
      {},
      'Test context',
      apiKey,
      (level, msg) => console.log(`[${level.toUpperCase()}] ${msg}`)
    );

    console.log(`\n✅ --- PHASE D RESULTS ---`);
    console.log(`Returned ${deduplicated_actions.length} actions.`);
    
    expect(deduplicated_actions.length).toBeGreaterThan(0);
    
    const normalizedAction = deduplicated_actions[0];
    
    // Assert that the normalization rule worked
    expect(normalizedAction).toHaveProperty('interacted_components');
    expect(normalizedAction).toHaveProperty('input_data');
    expect(normalizedAction).toHaveProperty('is_error_recovery');
    expect(normalizedAction).toHaveProperty('context_note');
    expect(normalizedAction).toHaveProperty('confidence');
    
    // Check default values
    expect(normalizedAction.is_error_recovery).toBe(false);
    expect(normalizedAction.confidence).toBe('high');
  }, 120000);
});
