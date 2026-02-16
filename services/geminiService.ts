
import { GoogleGenAI } from '@google/genai';
import { PHASE_A_SYSTEM_PROMPT, PHASE_B_SYSTEM_PROMPT, PASS_2_SYSTEM_PROMPT } from '../constants';
import { ActionItem, PhaseBResponse } from '../types';
import { formatMMSS } from '../utils/timeUtils';

// Helper for exponential backoff
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Initialize clients
const getClient = () => {
  return new GoogleGenAI({ apiKey: process.env.API_KEY });
};

// Minimal interface for Interactions API
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
    .replace('{OVERLAP_START}', formatMMSS(startSec))
    .replace('{OVERLAP_END}', formatMMSS(endSec));

  let lastError: any;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      let currentPrompt = `Analyze this video segment. ${basePrompt}`;
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
                mimeType: 'video/*',
              },
              videoMetadata: {
                startOffset: `${startSec}s`,
                endOffset: `${endSec}s`,
              }
            } as any,
            { text: currentPrompt }
          ]
        }],
        config: {
          responseMimeType: 'application/json',
        }
      });

      const text = response.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error("No response content from Phase A");

      const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
      
      try {
        const result = JSON.parse(cleanText) as ActionItem[];
        if (!Array.isArray(result)) throw new Error("Phase A response must be a JSON array");
        return result;
      } catch (parseError) {
        console.warn(`Phase A JSON Parse error (attempt ${attempt}):`, parseError);
        throw new Error(`JSON_PARSE_ERROR: ${parseError}`); 
      }

    } catch (error: any) {
      console.warn(`Phase A Attempt ${attempt} failed:`, error);
      lastError = error;

      const errStr = error.toString();
      if (errStr.includes('400') || errStr.includes('403') || errStr.includes('404')) {
         throw error;
      }

      if (attempt < 3) {
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
      });

      const lastOutput = interaction.outputs?.[interaction.outputs.length - 1];
      const text = lastOutput?.text;
      
      if (!text) throw new Error("No text content in Phase B response");

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

      if (error.toString().includes('400') || error.toString().includes('403')) {
         throw error;
      }

      if (attempt < 3) {
        const delay = Math.pow(2, attempt) * 1000;
        await wait(delay);
      }
    }
  }
  
  throw lastError;
}

export async function analyzeNarrationSegment(
  videoUrl: string,
  startSec: number,
  endSec: number,
  relevantVisualActions: ActionItem[]
): Promise<ActionItem[]> {
  const ai = getClient();
  
  // Create a minimal version of the visual log to save tokens and focus context
  const simplifiedActions = relevantVisualActions.map(a => ({
    timestamp: a.timestamp,
    action: a.action_type,
    element: a.target?.element,
    detail: a.detail
  }));
  
  const prompt = PASS_2_SYSTEM_PROMPT
    .replace('{START_TIME}', formatMMSS(startSec))
    .replace('{END_TIME}', formatMMSS(endSec))
    .replace('{VISUAL_ACTIONS}', JSON.stringify(simplifiedActions, null, 2));

  let lastError: any;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      let currentPrompt = prompt;
      currentPrompt += `\n\nTIMING CONTEXT: You are analyzing the video segment from ${formatMMSS(startSec)} to ${formatMMSS(endSec)}. Ensure timestamps are relative to the start of the full video (00:00).`;

      if (attempt > 1) {
        currentPrompt += "\n\nCRITICAL: You MUST respond with valid JSON only. No markdown fences.";
      }

      const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: [{
          role: 'user',
          parts: [
            {
              fileData: {
                fileUri: videoUrl,
                mimeType: 'video/*', 
              },
              videoMetadata: {
                startOffset: `${startSec}s`,
                endOffset: `${endSec}s`,
              }
            } as any,
            { text: currentPrompt }
          ]
        }],
        config: {
          responseMimeType: 'application/json',
        }
      });

      const text = response.candidates?.[0]?.content?.parts?.[0]?.text;
      
      if (!text) {
         console.log("Empty response for narration segment.");
         return [];
      }

      const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
      
      try {
        let result = JSON.parse(cleanText) as ActionItem[];
        
        // Handle potential non-array response by wrapping it
        if (!Array.isArray(result)) {
           if (typeof result === 'object' && result !== null) {
              // @ts-ignore
              result = [result];
           } else {
              return [];
           }
        }
        
        return result.map(r => ({
           ...r,
           action_type: 'narration', 
           // Ensure compat with ActionItem interface
           detail: r.text || '', 
           confidence: r.confidence || 'high',
           target: r.target || { element: 'narration', location: '', panel: '', visual: '' },
           actor: 'narrator'
        }));
      } catch (parseError) {
        console.warn("JSON parse error in narration:", parseError, text);
        if (cleanText === '{}') return [];
        throw new Error(`JSON_PARSE_ERROR: ${parseError}`); 
      }

    } catch (error: any) {
      console.warn(`Narration Segment Analysis Attempt ${attempt} failed:`, error);
      lastError = error;

      const errStr = error.toString();
      if (errStr.includes('400') || errStr.includes('403') || errStr.includes('404')) {
         throw error; // Changed from return [] to allow UI to handle error
      }

      if (attempt < 3) {
        const delay = Math.pow(2, attempt) * 1000;
        await wait(delay);
      }
    }
  }

  throw lastError;
}
