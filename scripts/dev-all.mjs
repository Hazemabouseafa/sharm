import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const pnpmCmd = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

const children = [
  spawn('node', ['scripts/local-mail-capture.mjs'], { cwd: rootDir, stdio: 'inherit', shell: true }),
  spawn(pnpmCmd, ['dev:api'], { cwd: rootDir, stdio: 'inherit', shell: true }),
  spawn(pnpmCmd, ['dev:worker'], { cwd: rootDir, stdio: 'inherit', shell: true }),
  spawn(pnpmCmd, ['dev:web'], { cwd: rootDir, stdio: 'inherit', shell: true }),
];

process.on('SIGINT', () => {
  for (const child of children) {
    child.kill('SIGTERM');
  }
  process.exit(0);
});
