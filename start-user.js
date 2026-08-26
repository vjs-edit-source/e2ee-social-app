import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log("===================================================");
console.log("Launching CipherSocial User App...");
console.log("   Connecting to E2EE Engine Backend (Port 4000)");
console.log("   User Interface running on Port 5000");
console.log("===================================================");
console.log("");
console.log("  NOTE: Make sure the main E2EE Engine is running first!");
console.log("  Start it with: node start.js");
console.log("");

// Launch User Frontend Dev Server (port 5000)
const clientProcess = spawn('npx', ['vite', '--host'], {
  cwd: path.join(__dirname, 'user-client'),
  stdio: 'inherit',
  shell: true
});

process.on('SIGINT', () => {
  clientProcess.kill();
  process.exit();
});
