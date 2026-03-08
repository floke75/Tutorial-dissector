import { processVideoJob, getJobState } from "./server/jobManager.ts";
import "dotenv/config";

async function runTest(name: string, videoUrl: string, durationInput: string, chunkSize: number, overlap: number, apiKey: string) {
  console.log(`\n==================================================`);
  console.log(`Starting Test: ${name}`);
  console.log(`Video: ${videoUrl}`);
  console.log(`==================================================\n`);

  const jobId = `test_${Date.now()}`;
  
  // Start the job asynchronously
  processVideoJob({
    jobId,
    videoUrl,
    durationInput,
    chunkSize,
    overlap,
    customContext: "This is an automated verification test.",
    apiKey
  }).catch(err => {
    console.error(`Job failed to start:`, err);
  });

  console.log(`Job started with ID: ${jobId}`);

  return new Promise<void>((resolve, reject) => {
    const interval = setInterval(() => {
      const state = getJobState(jobId);
      if (!state) {
        // Job might not be initialized yet
        return;
      }

      console.log(`[${state.status}] Progress: ${state.progress.toFixed(1)}%`);

      if (state.status === 'completed') {
        clearInterval(interval);
        console.log(`\n✅ Test '${name}' completed successfully.`);
        
        // Run assertions
        const actions = state.actions || [];
        const steps = state.narrativeSteps || [];
        
        const userActions = actions.filter(a => a.actor === 'user' && !a.is_error_recovery);
        const linkedActionIds = new Set(steps.flatMap(s => s.linked_visual_action_ids));
        const unlinkedActions = userActions.filter(a => !linkedActionIds.has(a.id));
        
        const coverage = userActions.length > 0 
          ? ((userActions.length - unlinkedActions.length) / userActions.length) * 100 
          : 100;

        console.log(`\n--- Verification Results ---`);
        console.log(`Total Actions: ${actions.length}`);
        console.log(`User Actions: ${userActions.length}`);
        console.log(`Narrative Steps: ${steps.length}`);
        console.log(`Link Coverage: ${coverage.toFixed(1)}%`);

        if (coverage < 80) {
          console.warn(`⚠️ Warning: Link coverage is below 80% (${coverage.toFixed(1)}%)`);
        } else {
          console.log(`✅ Link coverage is >= 80%`);
        }

        // Check for broken links
        let brokenLinks = 0;
        const allActionIds = new Set(actions.map(a => a.id));
        for (const step of steps) {
          for (const id of step.linked_visual_action_ids) {
            if (!allActionIds.has(id)) brokenLinks++;
          }
        }
        console.log(`Broken Links: ${brokenLinks}`);
        if (brokenLinks > 0) {
          console.error(`❌ Error: Found ${brokenLinks} broken links.`);
        } else {
          console.log(`✅ No broken links found.`);
        }

        // Check schema
        let invalidInsightTypes = 0;
        const validInsightTypes = ['explanation', 'rationale', 'tip', 'warning', 'workflow_framing', 'comparison'];
        for (const step of steps) {
          if (!validInsightTypes.includes(step.insight_type)) invalidInsightTypes++;
        }
        console.log(`Invalid Insight Types: ${invalidInsightTypes}`);
        if (invalidInsightTypes > 0) {
          console.error(`❌ Error: Found ${invalidInsightTypes} invalid insight types.`);
        } else {
          console.log(`✅ All insight types are valid.`);
        }

        // Check normalization
        let unnormalizedActions = 0;
        for (const action of actions) {
          if (
            action.interacted_components === undefined ||
            action.input_data === undefined ||
            action.is_error_recovery === undefined ||
            action.context_note === undefined ||
            action.confidence === undefined
          ) {
            unnormalizedActions++;
          }
        }
        console.log(`Unnormalized Actions: ${unnormalizedActions}`);
        if (unnormalizedActions > 0) {
          console.error(`❌ Error: Found ${unnormalizedActions} unnormalized actions.`);
        } else {
          console.log(`✅ All actions are normalized.`);
        }

        resolve();
      } else if (state.status === 'error' || state.status === 'cancelled') {
        clearInterval(interval);
        reject(new Error(`Job failed with status: ${state.status}`));
      }
    }, 5000);
  });
}

async function main() {
  try {
    console.log('Fetching API key from local server...');
    const response = await fetch('http://localhost:3000/api/config');
    const data = await response.json();
    
    if (!data.apiKey) {
      console.error('Failed to get API key from local server. Is the server running?');
      process.exit(1);
    }
    const apiKey = data.apiKey;

    // Short video test (single chunk) - 15 seconds
    await runTest("Short Video (Single Chunk)", "https://youtu.be/RHx-PGeh9xk?is=KcxIQuIjAfBbV_Iz", "00:15", 15, 0, apiKey);
    
    // Multi-chunk test (simulating a longer video, but keeping it short enough to run in a test) - 30 seconds, 15s chunks, 5s overlap
    await runTest("Multi-Chunk Video", "https://youtu.be/RHx-PGeh9xk?is=KcxIQuIjAfBbV_Iz", "00:30", 15, 5, apiKey);
    
    console.log("\n🎉 All verification tests completed.");
    process.exit(0);
  } catch (error) {
    console.error("\n❌ Test failed:", error);
    process.exit(1);
  }
}

main();
