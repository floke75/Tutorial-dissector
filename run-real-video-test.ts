import fs from 'fs';
import path from 'path';

async function runRealVideoTest() {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    console.error('Failed to get API key from local server. Is the server running?');
    process.exit(1);
  }

  const videoUrl = 'https://youtu.be/RHx-PGeh9xk?si=tOaC1CrxHbOO7Csl';
  const durationInput = '03:48';
  const softwareName = 'Cuez Automator, Cuez Rundown';

  console.log(`Starting job for video: ${videoUrl}`);
  const startReq = await fetch('http://127.0.0.1:3000/api/start-job', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      videoUrl,
      durationInput,
      chunkSize: 60,
      overlap: 15,
      narrationChunkSize: 60,
      customContext: 'Live demo test',
      apiKey,
      softwareName,
      glossaryPath: 'cuez_rundown_vocabulary_v2.4.json'
    })
  });

  if (!startReq.ok) {
    const errorText = await startReq.text();
    console.error('Failed to start job:', startReq.status, errorText);
    process.exit(1);
  }

  const { jobId } = await startReq.json();
  console.log(`Job started successfully. Job ID: ${jobId}`);

  // Poll until complete
  let isComplete = false;
  let resultState = null;
  
  while (!isComplete) {
    await new Promise(resolve => setTimeout(resolve, 5000)); // Poll every 5s
    let state: any;
    try {
      const statusReq = await fetch(`http://127.0.0.1:3000/api/start-job/${jobId}`);
      if (!statusReq.ok) {
        console.warn('Failed to fetch status:', statusReq.status);
        if (statusReq.status === 404) {
           console.error('Job disappeared from server.');
           process.exit(1);
        }
        continue;
      }
      state = await statusReq.json();
      
      // Print logs we haven't seen yet
      if (state.logs) {
        if (!state._lastLogCount) state._lastLogCount = 0;
        const newLogs = state.logs.slice((global as any)._lastLogCount || 0);
        for (const log of newLogs) {
           console.log(`[BACKEND LOG] ${log.message}`);
        }
        (global as any)._lastLogCount = state.logs.length;
      }
      
    } catch (e: any) {
      console.warn('Network error fetching status, retrying...', e.message);
      continue;
    }
    
    if (state.status === 'completed' || state.status === 'error' || state.status === 'cancelled') {
        isComplete = true;
        resultState = state;
        console.log(`Job ended with status: ${state.status}`);
    } else {
        console.log(`Status: ${state.status} | Progress: ${Math.round(state.progress || 0)}%`);
    }
  }

  const outputDir = path.resolve('test-output');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir);
  }

  const outPath = path.join(outputDir, 'real_video_result.json');
  fs.writeFileSync(outPath, JSON.stringify(resultState, null, 2));
  console.log(`Saved result to ${outPath}`);
}

runRealVideoTest().catch((err) => {
    console.error(err);
    process.exit(1);
});
