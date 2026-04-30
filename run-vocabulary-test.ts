import { generateExtractionVocabulary } from './utils/extractionVocabulary';
import { PHASE_A_SYSTEM_PROMPT, PHASE_B_SYSTEM_PROMPT } from './constants';
import fs from 'fs';

// Load our specific json file
const testJSONFile = 'cuez_rundown_vocabulary_v2.4.json';

runTest();

function runTest() {
    console.log("=== Running Vocabulary Pipeline Test ===");

    // Test 1: Single Software Name
    console.log("\n--- Test 1: Single software name (Cuez Automator) ---");
    let softwareName = "Cuez Automator";
    
    let vocab1 = generateExtractionVocabulary(testJSONFile, softwareName);
    console.log("Extracted Vocabulary Length:", vocab1.length);
    if(vocab1.length > 0) {
        console.log("First 200 chars:\n", vocab1.substring(0, 200));
    } else {
        console.error("FAILED to extract vocabulary for " + softwareName);
        return;
    }

    // Test 2: Double Software Name
    console.log("\n--- Test 2: Double software name ---");
    softwareName = "Cuez Automator, Cuez Rundown";
    
    let vocab2 = generateExtractionVocabulary(testJSONFile, softwareName);
    console.log("Extracted Vocabulary Length:", vocab2.length);
    if(vocab2.length > 0) {
        console.log("First 200 chars:\n", vocab2.substring(0, 200));
    } else {
        console.error("FAILED to extract vocabulary for " + softwareName);
        return;
    }

    // Generate prompt previews
    let customContext = "This is a test user context.";
    
    // Simulate what happens in jobManager
    const dynamicContext = [customContext, vocab2].filter(Boolean).join('\n\n');
    
    // Simulating Phase A prompt formulation
    let basePrompt = PHASE_A_SYSTEM_PROMPT
     .replace('{primary_start}', "00:00")
     .replace('{primary_end}', "00:30")
     .replace('{overlap_start}', "00:00")
     .replace('{overlap_end}', "00:30");
     
    let systemInstructionA = basePrompt;
    if (dynamicContext) {
        systemInstructionA += `\n\nCUSTOM APP CONTEXT:\n${dynamicContext}\n\nUse this context to better understand the application, standardize function names, and provide a more holistic analysis.`;
    }

    console.log("\n--- PHASE A System Instruction Snippet (End) ---");
    console.log(systemInstructionA.substring(systemInstructionA.length - 1000));
    
    // Simulating Phase B prompt formulation
    let videoInstructionB = `\n[CONTEXT]\n${dynamicContext}\n[END CONTEXT]\n\n`;
    videoInstructionB += PHASE_B_SYSTEM_PROMPT;

    console.log("\n--- PHASE B System Instruction Snippet (Beginning) ---");
    console.log(videoInstructionB.substring(0, 1000));

    console.log("\n=== Test Completed Successfully ===");
}
