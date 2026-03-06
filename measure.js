const start = Date.now();
import { spawn } from 'child_process';

const child = spawn('npx', ['node', 'server.ts'], { stdio: 'pipe' });

child.stdout.on('data', (data) => {
  const output = data.toString();
  console.log(output);
  if (output.includes('Server running')) {
    console.log(`Time to start: ${Date.now() - start}ms`);
    child.kill();
    process.exit(0);
  }
});

child.stderr.on('data', (data) => {
  console.error(data.toString());
});

setTimeout(() => {
  console.log(`Timeout after ${Date.now() - start}ms`);
  child.kill();
  process.exit(1);
}, 15000);
