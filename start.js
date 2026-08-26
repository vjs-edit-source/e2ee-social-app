import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log("===================================================");
console.log("🚀 Launching CipherSocial Full-Stack Engine...");
console.log("   1. Backend Zero-Knowledge Server (Port 4000)");
console.log("   2. Frontend HTTPS Vite App (Port 3000)");
console.log("===================================================");

// 1. Launch Backend Server
const serverProcess = spawn('node', ['server/index.js'], {
  cwd: __dirname,
  stdio: 'inherit',
  shell: true
});

// 2. Launch Frontend Dev Server
const clientProcess = spawn('npx', ['vite', '--host'], {
  cwd: path.join(__dirname, 'client'),
  stdio: 'inherit',
  shell: true
});

process.on('SIGINT', () => {
  serverProcess.kill();
  clientProcess.kill();
  process.exit();
});
