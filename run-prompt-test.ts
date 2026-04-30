import { generateExtractionVocabulary } from './utils/extractionVocabulary';
import { PHASE_A_SYSTEM_PROMPT, PHASE_B_SYSTEM_PROMPT, PASS_2_SYSTEM_PROMPT, GLOBAL_DEDUPLICATION_PROMPT } from './constants';
import fs from 'fs';
import path from 'path';

// Load our specific json file
const testJSONFile = 'cuez_rundown_vocabulary_v2.4.json';

runTest();

function runTest() {
    console.log("=== Generating Prompts for Human Review ===");

    // Test: Double Software Name
    let softwareName = "Cuez Automator, Cuez Rundown";
    let vocab = generateExtractionVocabulary(testJSONFile, softwareName);
    let customContext = "This app is used by broadcasters to trigger rundown elements in real time.";
    
    // Simulate what happens in jobManager
    const dynamicContext = [customContext, vocab].filter(Boolean).join('\n\n');
    
    const outputDir = path.resolve('test-output');
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir);
    }
    
    // -------------------------------------------------------------
    // PHASE A
    // -------------------------------------------------------------
    let basePromptA = PHASE_A_SYSTEM_PROMPT
     .replace('{primary_start}', "01:00")
     .replace('{primary_end}', "01:30")
     .replace('{overlap_start}', "00:50")
     .replace('{overlap_end}', "01:40");
     
    let systemInstructionA = basePromptA;
    if (dynamicContext) {
        systemInstructionA += `\n\nCUSTOM APP CONTEXT:\n${dynamicContext}\n\nUse this context to better understand the application, standardize function names, and provide a more holistic analysis.`;
    }
    
    let currentPromptA = `Analyze this video segment.`;
    currentPromptA += `\n\nTIMING CONTEXT: You are analyzing the video segment from 00:50 to 01:40. Ensure timestamps are relative to the start of the full video (00:00).`;
    
    const phaseAFile = `# PHASE A PROMPT\n\n## Content / User Prompt\n\n${currentPromptA}\n\n## System Instruction\n\n${systemInstructionA}`;
    fs.writeFileSync(path.join(outputDir, 'Phase_A_Prompt.md'), phaseAFile);
    console.log("Generated Phase_A_Prompt.md");

    // -------------------------------------------------------------
    // PHASE B
    // -------------------------------------------------------------
    let videoInstructionB = `\n[CONTEXT]\n${dynamicContext}\n[END CONTEXT]\n\n`;
    videoInstructionB += PHASE_B_SYSTEM_PROMPT;
    
    const mockedActions = [
      { id: 'evt_1', timestamp: '01:05', action_type: 'click', target: { element: 'Menu' } }
    ];
    let currentPromptB = `Process these raw visual actions and annotations for the timespan 01:00s-01:30s.\n\nRaw Actions:\n${JSON.stringify(mockedActions, null, 2)}\n\nAnnotations:\n[]\n\nExtract the precise UI state updates and return the validated events array.`;

    const phaseBFile = `# PHASE B PROMPT\n\n## Content / User Prompt\n\n(Follows CHAT HISTORY constraint. Initial user prompt includes context + instructions)\n\n${videoInstructionB}\n\n${currentPromptB}`;
    fs.writeFileSync(path.join(outputDir, 'Phase_B_Prompt.md'), phaseBFile);
    console.log("Generated Phase_B_Prompt.md");

    // -------------------------------------------------------------
    // PHASE C
    // -------------------------------------------------------------
    let previousStepsContext = "This is the beginning of the video.";
    let promptC = PASS_2_SYSTEM_PROMPT
      .replace('{start_time}', "01:00")
      .replace('{end_time}', "01:30")
      .replace('{previous_steps_context}', previousStepsContext)
      .replace('{visual_actions}', JSON.stringify(mockedActions))
      .replace('{annotations}', "[]");

    let systemInstructionC = promptC;
    if (dynamicContext) {
        systemInstructionC += `\n\nCUSTOM APP CONTEXT:\n${dynamicContext}\n\nUse this context to better understand the application, standardize function names, and provide a more holistic analysis.`;
    }

    let currentPromptC = `Analyze this video segment.`;
    currentPromptC += `\n\nTIMING CONTEXT: You are analyzing the video segment from 01:00 to 01:30. Ensure timestamps are relative to the start of the full video (00:00).`;

    const phaseCFile = `# PHASE C PROMPT\n\n## Content / User Prompt\n\n${currentPromptC}\n\n## System Instruction\n\n${systemInstructionC}`;
    fs.writeFileSync(path.join(outputDir, 'Phase_C_Prompt.md'), phaseCFile);
    console.log("Generated Phase_C_Prompt.md");

    // -------------------------------------------------------------
    // PHASE D
    // -------------------------------------------------------------
    let minifiedNarrative = [
      { id: 'nar_1', desc: 'User clicked menu' }
    ];
    let promptD = GLOBAL_DEDUPLICATION_PROMPT
      .replace('{all_actions}', JSON.stringify(mockedActions))
      .replace('{narrative_context}', JSON.stringify(minifiedNarrative))
      .replace('{final_ui_state}', "{}");

    if (dynamicContext) {
        promptD += `\n\nCUSTOM APP CONTEXT:\n${dynamicContext}\n\nUse this context to ensure naming consistency matches the user's specific application terminology.`;
    }
    
    const phaseDFile = `# PHASE D PROMPT\n\n## Content / User Prompt\n\n${promptD}`;
    fs.writeFileSync(path.join(outputDir, 'Phase_D_Prompt.md'), phaseDFile);
    console.log("Generated Phase_D_Prompt.md");

    console.log("\n=== Test Completed Successfully ===");
    console.log("You can review the generated markdown files in the 'test-output' folder.");
}
