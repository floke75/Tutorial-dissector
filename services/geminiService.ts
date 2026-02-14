import { GoogleGenAI } from '@google/genai';
import { PHASE_A_SYSTEM_PROMPT, PHASE_B_SYSTEM_PROMPT } from '../constants';
import { ActionItem, PhaseBResponse } from '../types';
import { formatMMSS } from '../utils/timeUtils';

// Helper for exponential backoff
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Initialize clients
// Direct access relies on build-time replacement of process.env.API_KEY
// or a global definition. This is the standard pattern for this environment.
const getClient = () => {
  return new GoogleGenAI({ apiKey: process.env.API_KEY });
};

// Minimal interface for Interactions API to avoid raw 'any' casting
interface InteractionsClient {
  create: (config: any) => Promise<{
    id: string;
    outputs: Array<{ text: string }>;
  }>;
}

export async function analyzeChunkPhaseA(
  videoUrl: string,
  startSec: number,
  endSec: number,
  primaryStartSec: number,
  primaryEndSec: number,
  overlapSec: number
): Promise<ActionItem[]> {
  const ai = getClient();
  
  const basePrompt = PHASE_A_SYSTEM_PROMPT
    .replace('{PRIMARY_START}', formatMMSS(primaryStartSec))
    .replace('{PRIMARY_END}', formatMMSS(primaryEndSec))
    .replace('{OVERLAP_START}', formatMMSS(Math.max(0, primaryStartSec - overlapSec)))
    .replace('{OVERLAP_END}', formatMMSS(endSec)); // endSec is already primaryEnd + overlap

  let lastError: any;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      // If retrying (especially after a parse error), reinforce JSON requirement
      let currentPrompt = `Analyze this video segment. ${basePrompt}`;
      
      // Reinforce the time offset context explicitly for the model
      // This helps the model map the "00:00" it sees in the clip to the actual full-video timestamp
      currentPrompt += `\n\nTIMING CONTEXT: The video clip you are watching is a segment from ${formatMMSS(startSec)} to ${formatMMSS(endSec)} of the full video. The 00:00 mark in this clip equals ${formatMMSS(startSec)} in the full video. You MUST offset your timestamps by +${formatMMSS(startSec)} to match the full video time.`;

      if (attempt > 1) {
        currentPrompt += "\n\nCRITICAL: You MUST respond with valid JSON only. No markdown fences, no commentary. Check for trailing commas or unquoted keys.";
      }

      const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: [{
          role: 'user',
          parts: [
            {
              fileData: {
                fileUri: videoUrl,
                mimeType: 'video/*', // CHANGED: 'video/*' is required for YouTube URL clipping to work reliably
              },
              videoMetadata: {
                startOffset: `${startSec}s`,
                endOffset: `${endSec}s`,
              }
            } as any, // Cast to avoid TS issues if SDK types don't fully support videoMetadata on Part yet
            { text: currentPrompt }
          ]
        }],
        config: {
          thinkingConfig: { thinkingLevel: 'HIGH' },
          mediaResolution: 'MEDIA_RESOLUTION_HIGH',
          responseMimeType: 'application/json',
        }
      });

      const text = response.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error("No response content from Phase A");

      // Clean potential markdown fences
      const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
      
      try {
        const result = JSON.parse(cleanText) as ActionItem[];
        if (!Array.isArray(result)) throw new Error("Phase A response must be a JSON array");
        return result;
      } catch (parseError) {
        console.warn(`Phase A JSON Parse error (attempt ${attempt}):`, parseError);
        console.debug("Raw text received:", text);
        // Throw special error to trigger the retry loop
        throw new Error(`JSON_PARSE_ERROR: ${parseError}`); 
      }

    } catch (error: any) {
      console.warn(`Phase A Attempt ${attempt} failed:`, error);
      lastError = error;

      // Fail fast on client errors (4xx) which indicate bad input/permissions
      // Note: We do NOT fail fast on API_KEY errors here blindly, we let the retries happen 
      // unless it's clearly a 403 or similar.
      const errStr = error.toString();
      if (errStr.includes('400') || errStr.includes('403') || errStr.includes('404')) {
         throw error;
      }

      if (attempt < 3) {
        // Backoff: 2s, 4s
        const delay = Math.pow(2, attempt) * 1000;
        await wait(delay);
      }
    }
  }

  throw lastError;
}

export async function accumulateChunkPhaseB(
  videoUrl: string,
  durationStr: string,
  chunkActions: ActionItem[],
  chunkNumber: number,
  primaryWindow: string,
  previousInteractionId: string | null
): Promise<{ interactionId: string, result: PhaseBResponse }> {
  const client = getClient();

  const systemInstruction = PHASE_B_SYSTEM_PROMPT
    .replace('{VIDEO_TITLE}', 'User Video')
    .replace('{VIDEO_URL}', videoUrl)
    .replace('{TOTAL_DURATION}', durationStr);

  let lastError: any;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      // Use typed access for interactions
      const interactionsClient = (client as unknown as { interactions: InteractionsClient }).interactions;
      
      if (!interactionsClient) {
          throw new Error("Interactions API not supported in this SDK version");
      }

      const interaction = await interactionsClient.create({
        model: 'gemini-3-pro-preview',
        system_instruction: systemInstruction,
        input: JSON.stringify({
          chunk_number: chunkNumber,
          primary_window: primaryWindow,
          extracted_actions: chunkActions
        }),
        previous_interaction_id: previousInteractionId || undefined,
        generation_config: { 
            thinking_level: 'high' 
        },
      });

      const lastOutput = interaction.outputs?.[interaction.outputs.length - 1];
      const text = lastOutput?.text;
      
      if (!text) throw new Error("No text content in Phase B response");

      // Clean potential markdown fences
      const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
      
      try {
          const result = JSON.parse(cleanText) as PhaseBResponse;
          return {
            interactionId: interaction.id,
            result
          };
      } catch (parseError) {
          console.warn(`Phase B JSON Parse error (attempt ${attempt}):`, parseError);
          throw new Error(`JSON_PARSE_ERROR: ${parseError}`);
      }

    } catch (error: any) {
      console.error(`Phase B Attempt ${attempt} failed:`, error);
      lastError = error;

       // Fail fast on client errors
      if (error.toString().includes('400') || error.toString().includes('403')) {
         throw error;
      }

      if (attempt < 3) {
        // Backoff: 2s, 4s
        const delay = Math.pow(2, attempt) * 1000;
        await wait(delay);
      }
    }
  }
  
  throw lastError;
}