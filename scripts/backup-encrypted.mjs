import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

function loadEnv() {
  const envPath = path.join(rootDir, '.env');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = val;
    }
  }
}

loadEnv();

function resolvePgTool(toolName) {
  const portableWin = path.resolve(rootDir, '..', 'tools', 'pgsql', 'pgsql', 'bin', `${toolName}.exe`);
  if (fs.existsSync(portableWin)) return portableWin;
  if (process.env.PG_BIN_DIR) {
    const candidate = path.join(process.env.PG_BIN_DIR, process.platform === 'win32' ? `${toolName}.exe` : toolName);
    if (fs.existsSync(candidate)) return candidate;
  }
  return toolName;
}

function collectStorageFiles(dirPath, baseDir = dirPath) {
  const entries = [];
  if (!fs.existsSync(dirPath)) return entries;
  for (const item of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const full = path.join(dirPath, item.name);
    if (item.isDirectory()) {
      entries.push(...collectStorageFiles(full, baseDir));
    } else if (item.isFile()) {
      const rel = path.relative(baseDir, full).replace(/\\/g, '/');
      const data = fs.readFileSync(full);
      entries.push({
        relativePath: rel,
        sizeBytes: data.length,
        sha256: crypto.createHash('sha256').update(data).digest('hex'),
        base64: data.toString('base64'),
      });
    }
  }
  return entries;
}

function parseDbUrl(rawUrl) {
  const cleanUrl = rawUrl.split('?')[0];
  return cleanUrl;
}

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error('DATABASE_URL is required for backup.');
  }
  const passphrase = process.env.BACKUP_ENCRYPTION_PASSPHRASE;
  if (!passphrase || passphrase.length < 16) {
    throw new Error('BACKUP_ENCRYPTION_PASSPHRASE (at least 16 chars) is required.');
  }

  const pgDumpBin = resolvePgTool('pg_dump');
  const cleanDbUrl = parseDbUrl(dbUrl);

  const sqlDump = execFileSync(
    pgDumpBin,
    ['--dbname', cleanDbUrl, '--no-owner', '--no-acl', '--clean', '--if-exists'],
    { encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 },
  );

  const publicStorageDir = path.resolve(rootDir, process.env.STORAGE_PUBLIC_DIR || './storage/public');
  const privateStorageDir = path.resolve(rootDir, process.env.STORAGE_PRIVATE_DIR || './storage/private');

  const publicFiles = collectStorageFiles(publicStorageDir);
  const privateFiles = collectStorageFiles(privateStorageDir);

  const payload = {
    version: 1,
    createdAt: new Date().toISOString(),
    databaseUrlHost: new URL(cleanDbUrl).host,
    databaseName: new URL(cleanDbUrl).pathname.replace(/^\//, ''),
    sqlDumpSha256: crypto.createHash('sha256').update(sqlDump, 'utf8').digest('hex'),
    sqlDump,
    storage: {
      publicFiles,
      privateFiles,
    },
  };

  const plaintext = Buffer.from(JSON.stringify(payload), 'utf8');
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = crypto.pbkdf2Sync(passphrase, salt, 210000, 32, 'sha256');
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();

  const envelope = {
    algorithm: 'AES-256-GCM',
    kdf: 'PBKDF2-SHA256-210000',
    createdAt: payload.createdAt,
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  };

  const backupDir = path.resolve(rootDir, './storage/backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = payload.createdAt.replace(/[:.]/g, '-');
  const backupFile = path.join(backupDir, `backup-${stamp}.enc`);
  const latestFile = path.join(backupDir, 'backup-latest.enc');

  const serialized = JSON.stringify(envelope);
  fs.writeFileSync(backupFile, serialized, 'utf8');
  fs.writeFileSync(latestFile, serialized, 'utf8');

  // Retention policy: keep up to 30 most recent daily backups
  const allBackups = fs
    .readdirSync(backupDir)
    .filter((f) => f.startsWith('backup-') && f !== 'backup-latest.enc' && f.endsWith('.enc'))
    .sort()
    .reverse();

  for (const oldFile of allBackups.slice(30)) {
    fs.unlinkSync(path.join(backupDir, oldFile));
  }

  console.log(
    JSON.stringify({
      status: 'OK',
      backupFile,
      latestFile,
      sqlBytes: Buffer.byteLength(sqlDump, 'utf8'),
      publicFilesCount: publicFiles.length,
      privateFilesCount: privateFiles.length,
      encryptedBytes: Buffer.byteLength(serialized, 'utf8'),
    }),
  );
}

main().catch((err) => {
  console.error('Backup failed:', err.message || err);
  process.exit(1);
});
