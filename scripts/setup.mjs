import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

function main() {
  const envFile = path.join(rootDir, '.env');
  const envExample = path.join(rootDir, '.env.example');
  if (!fs.existsSync(envFile) && fs.existsSync(envExample)) {
    fs.copyFileSync(envExample, envFile);
    console.log('Created .env from .env.example');
  }

  for (const rel of ['storage/public', 'storage/private', 'storage/backups']) {
    fs.mkdirSync(path.join(rootDir, rel), { recursive: true });
  }

  const pnpmCmd = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
  execSync(`${pnpmCmd} db:generate`, { cwd: rootDir, stdio: 'inherit' });
  execSync(`${pnpmCmd} db:migrate:deploy`, { cwd: rootDir, stdio: 'inherit' });
  execSync(`${pnpmCmd} db:seed:prod-init`, { cwd: rootDir, stdio: 'inherit' });
  console.log('Setup complete. For demo seed data, run: pnpm db:seed:demo');
}

main();
