import { execSync } from 'child_process';
try {
  const output = execSync('grep -r "string did not match the expected pattern" node_modules/', { maxBuffer: 1024*1024*10 });
  console.log(output.toString());
} catch(e) {
  if(e.stdout) console.log(e.stdout.toString());
}
