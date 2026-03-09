import { describe, it, expect } from 'vitest';
import { zodToJsonSchema } from 'zod-to-json-schema';
import {
  fixNullable,
  actionTargetSchema,
  actionItemSchema,
  phaseASchema,
  phaseBResponseSchema,
  pass2Schema
} from './geminiService';

describe('Gemini Schema Validation', () => {
  it('should remove $schema from generated schemas', () => {
    const rawSchema = zodToJsonSchema(actionTargetSchema, { target: "jsonSchema7", $refStrategy: "none" });
    expect(rawSchema).toHaveProperty('$schema');
    
    const fixedSchema = fixNullable(rawSchema);
    expect(fixedSchema).not.toHaveProperty('$schema');
  });

  it('should convert anyOf nullables to type array format required by Gemini', () => {
    const rawSchema = zodToJsonSchema(actionItemSchema, { target: "jsonSchema7", $refStrategy: "none" }) as any;
    
    // Before fix, target should use anyOf
    expect(rawSchema.properties?.target).toHaveProperty('anyOf');
    
    const fixedSchema = fixNullable(rawSchema);
    
    // After fix, target should use type: ["object", "null"]
    expect(fixedSchema.properties?.target).not.toHaveProperty('anyOf');
    expect(fixedSchema.properties?.target).toHaveProperty('type');
    expect(fixedSchema.properties?.target.type).toEqual(['object', 'null']);
    
    // Check other nullable fields
    expect(fixedSchema.properties?.interacted_components.type).toEqual(['array', 'null']);
    expect(fixedSchema.properties?.ui_context.type).toEqual(['object', 'null']);
    expect(fixedSchema.properties?.input_data.type).toEqual(['object', 'null']);
    expect(fixedSchema.properties?.is_error_recovery.type).toEqual(['boolean', 'null']);
  });

  it('should successfully format Phase A schema for Gemini', () => {
    const rawSchema = zodToJsonSchema(phaseASchema, { target: "jsonSchema7", $refStrategy: "none" }) as any;
    const fixedSchema = fixNullable(rawSchema);
    
    expect(fixedSchema).not.toHaveProperty('$schema');
    expect(fixedSchema.type).toBe('object');
    expect(fixedSchema.properties.actions.type).toBe('array');
    expect(fixedSchema.properties.actions.items.type).toBe('object');
    expect(fixedSchema.properties.actions.items.properties.target.type).toEqual(['object', 'null']);
  });

  it('should successfully format Phase B schema for Gemini', () => {
    const rawSchema = zodToJsonSchema(phaseBResponseSchema, { target: "jsonSchema7", $refStrategy: "none" }) as any;
    const fixedSchema = fixNullable(rawSchema);
    
    expect(fixedSchema).not.toHaveProperty('$schema');
    expect(fixedSchema.type).toBe('object');
    expect(fixedSchema.properties.validated_segment_events.items.properties.target.type).toEqual(['object', 'null']);
  });

  it('should successfully format Pass 2 schema for Gemini', () => {
    const rawSchema = zodToJsonSchema(pass2Schema, { target: "jsonSchema7", $refStrategy: "none" }) as any;
    const fixedSchema = fixNullable(rawSchema);
    
    expect(fixedSchema).not.toHaveProperty('$schema');
    expect(fixedSchema.type).toBe('object');
    expect(fixedSchema.properties.steps.type).toBe('array');
    expect(fixedSchema.properties.steps.items.type).toBe('object');
    expect(fixedSchema.properties.steps.items.properties.insight_type.enum).toContain('explanation');
  });
});

describe('Real-world Gemini 3.1 Usage Tests', () => {
  it('should validate a typical Phase A action item with null target', () => {
    const mockAction = {
      id: "tmp_123",
      timestamp: "01:30",
      action_type: "system_event",
      actor: "system",
      target: null, // Testing the nullable fix
      interacted_components: null,
      ui_context: null,
      input_data: null,
      is_error_recovery: false,
      detail: "The system finished loading the project.",
      result: "Project loaded",
      context_note: "Automatic transition",
      confidence: "high"
    };

    // Zod should successfully parse this
    const result = actionItemSchema.safeParse(mockAction);
    expect(result.success).toBe(true);
  });

  it('should validate a typical Phase A action item with full target', () => {
    const mockAction = {
      id: "tmp_124",
      timestamp: "01:35",
      action_type: "click",
      actor: "user",
      target: {
        element: "Submit Button",
        location: "Bottom Right",
        panel: "Main Form",
        visual: "Blue button with white text",
        spatial_bounding_box: [900, 800, 950, 900]
      },
      interacted_components: [
        {
          type: "button",
          label: "Submit",
          state_before: "default",
          state_after: "loading"
        }
      ],
      ui_context: {
        active_panel: "Main Form",
        active_tool: "Pointer",
        open_dialogs: []
      },
      input_data: null,
      is_error_recovery: false,
      detail: "User clicked the submit button.",
      result: "Form submitted",
      context_note: "User completed the form",
      confidence: "high"
    };

    const result = actionItemSchema.safeParse(mockAction);
    expect(result.success).toBe(true);
  });

  it('should validate Phase B response schema', () => {
    const mockResponse = {
      chunk_processed: {
        number: 1,
        primary_window: "00:00-01:00"
      },
      new_actions_added: 5,
      duplicates_removed: 1,
      conflicts_resolved: ["Resolved duplicate click"],
      current_ui_state: {
        application: "VS Code",
        active_file: "index.ts",
        visible_panels: ["Explorer", "Editor"],
        active_tool: "Cursor",
        open_dialogs: [],
        other_state: "Normal"
      },
      cumulative_action_count: 5,
      validated_segment_events: [
        {
          id: "evt_1",
          timestamp: "00:10",
          action_type: "click",
          actor: "user",
          target: {
            element: "File",
            location: "Top Menu",
            panel: "Menu Bar",
            visual: "Text 'File'"
          },
          detail: "Clicked File menu",
          result: "Menu opened",
          context_note: "",
          confidence: "high"
        }
      ]
    };

    const result = phaseBResponseSchema.safeParse(mockResponse);
    expect(result.success).toBe(true);
  });
});

