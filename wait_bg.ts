import fs from 'fs';

async function wait() {
  let attempts = 0;
  while(attempts < 60) {
    if (fs.existsSync('test-output/test_run.log')) {
      const content = fs.readFileSync('test-output/test_run.log', 'utf8');
      if (content.includes('Job ended with status: completed')) {
        console.log('Finished!');
        process.exit(0);
      }
      if (content.includes('Job ended with status: error')) {
        console.log('Error!');
        process.exit(1);
      }
    }
    await new Promise(r => setTimeout(r, 5000));
    attempts++;
  }
}
wait();
