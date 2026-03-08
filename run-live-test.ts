import { execSync } from 'child_process';

async function runLiveTest() {
  try {
    console.log('Fetching API key from local server...');
    const response = await fetch('http://localhost:3000/api/config');
    const data = await response.json();
    
    if (!data.apiKey) {
      console.error('Failed to get API key from local server. Is the server running?');
      process.exit(1);
    }

    console.log('API key retrieved. Running live integration test...');
    
    // Run vitest with the API key in the environment
    execSync('npx vitest run services/geminiService.integration.test.ts', {
      env: {
        ...process.env,
        GEMINI_API_KEY: data.apiKey
      },
      stdio: 'inherit'
    });
    
  } catch (error) {
    console.error('Error running test:', error);
    process.exit(1);
  }
}

runLiveTest();
