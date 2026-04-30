import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

export const narrativeStepSchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  intent: z.string(),
  precondition: z.string(),
  explanation: z.string(),
  postcondition: z.string(),
  insight_type: z.enum(['explanation', 'rationale', 'tip', 'warning', 'workflow_framing', 'comparison']),
  topics: z.array(z.string()),
  linked_visual_action_ids: z.array(z.string()),
  linked_annotation_ids: z.array(z.string()).optional()
});

export const pass2Schema = z.object({
  steps: z.array(narrativeStepSchema),
  learned_insights: z.string().optional().describe(
    "CRITICAL: Extract ONLY factual UI terminology..."
  )
});

console.log(JSON.stringify(zodToJsonSchema(pass2Schema, { target: "jsonSchema7", $refStrategy: "none" }), null, 2));
