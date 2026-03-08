import { describe, it, expect } from 'vitest';
import { analyzeChunkPhaseA } from './geminiService';

// The API key is automatically injected into the environment in AI Studio
const apiKey = process.env.GEMINI_API_KEY;

describe('Gemini 3.1 Live Integration Tests', () => {
  it('should analyze a real video chunk (Phase A)', async () => {
    if (!apiKey) {
      console.warn('Skipping live Gemini test because GEMINI_API_KEY is not set.');
      return;
    }

    const videoUrl = 'https://youtu.be/RHx-PGeh9xk?is=KcxIQuIjAfBbV_Iz';
    
    // Analyzing a 15-second chunk to keep the test reasonably fast while still 
    // providing enough context for the model to generate meaningful actions.
    const startSec = 0;
    const endSec = 15; 
    const primaryStartSec = 0;
    const primaryEndSec = 15;
    const overlapSec = 0;
    const customContext = 'This is an integration test evaluating the model performance.';

    console.log(`\n🚀 Starting live Gemini 3.1 Phase A analysis...`);
    console.log(`Video: ${videoUrl}`);
    console.log(`Segment: ${startSec}s to ${endSec}s`);
    
    const startTime = Date.now();
    
    const result = await analyzeChunkPhaseA(
      videoUrl,
      startSec,
      endSec,
      primaryStartSec,
      primaryEndSec,
      overlapSec,
      customContext,
      apiKey,
      (level, msg, data) => {
        // Log the internal progress of the service
        console.log(`[${level.toUpperCase()}] ${msg}`, data ? JSON.stringify(data).substring(0, 150) + (JSON.stringify(data).length > 150 ? '...' : '') : '');
      }
    );
    
    const duration = (Date.now() - startTime) / 1000;

    console.log(`\n✅ --- LIVE TEST RESULTS (${duration.toFixed(1)}s) ---`);
    console.log(`Extracted ${result.actions.length} actions and ${result.annotations.length} annotations.`);
    console.log(JSON.stringify(result, null, 2));
    console.log(`------------------------------------------\n`);

    // Assertions to ensure the schema matches our expectations
    expect(Array.isArray(result.actions)).toBe(true);
    expect(Array.isArray(result.annotations)).toBe(true);
    
    if (result.actions.length > 0) {
      const firstAction = result.actions[0];
      expect(firstAction).toHaveProperty('id');
      expect(firstAction).toHaveProperty('timestamp');
      expect(firstAction).toHaveProperty('action_type');
      expect(firstAction).toHaveProperty('actor');
      expect(firstAction).toHaveProperty('detail');
      expect(firstAction).toHaveProperty('confidence');
    }
  }, 120000); // 2-minute timeout to allow for video processing and generation
});
