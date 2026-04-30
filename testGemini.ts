import { z } from 'zod';
import { GoogleGenAI } from '@google/genai';
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
async function test() {
  try {
    const res = await ai.models.generateContent({
      model: 'gemini-3.1-pro-preview',
      contents: [{
        role: 'user',
        parts: [
          {
             fileData: { fileUri: 'https://www.youtube.com/watch?v=kYJ55zCgB9g' },
             videoMetadata: { startOffset: 'NaNs', endOffset: '20s' }
          },
          { text: 'Analyze this.' }
        ]
      }]
    });
    console.log("Success:", res.text);
  } catch(e) {
    console.log("Error type:", e.constructor.name);
    console.log("Error message:", e.message);
  }
}
test();
