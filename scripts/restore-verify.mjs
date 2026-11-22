import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

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

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error('DATABASE_URL is required.');
  }
  const passphrase = process.env.BACKUP_ENCRYPTION_PASSPHRASE;
  if (!passphrase) {
    throw new Error('BACKUP_ENCRYPTION_PASSPHRASE is required.');
  }

  const backupPath = path.resolve(rootDir, './storage/backups/backup-latest.enc');
  if (!fs.existsSync(backupPath)) {
    throw new Error(`No encrypted backup found at ${backupPath}. Run "pnpm backup:run" first.`);
  }

  const envelope = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
  const salt = Buffer.from(envelope.salt, 'base64');
  const iv = Buffer.from(envelope.iv, 'base64');
  const authTag = Buffer.from(envelope.authTag, 'base64');
  const ciphertext = Buffer.from(envelope.ciphertext, 'base64');

  const key = crypto.pbkdf2Sync(passphrase, salt, 210000, 32, 'sha256');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  const payload = JSON.parse(decrypted.toString('utf8'));

  const computedSqlHash = crypto.createHash('sha256').update(payload.sqlDump, 'utf8').digest('hex');
  if (computedSqlHash !== payload.sqlDumpSha256) {
    throw new Error('Decrypted SQL dump SHA-256 checksum mismatch.');
  }

  // Build disposable restore verification DB URL (never overwrite active dev/prod database)
  const parsed = new URL(dbUrl.split('?')[0]);
  const sourceDbName = parsed.pathname.replace(/^\//, '');
  const restoreDbName = 'sharm_pharaoh_restore_test';
  if (restoreDbName === sourceDbName) {
    throw new Error('Restore verification database must not match active DATABASE_URL.');
  }

  const adminUrlObj = new URL(parsed.toString());
  adminUrlObj.pathname = '/postgres';
  const adminUrl = adminUrlObj.toString();

  const restoreUrlObj = new URL(parsed.toString());
  restoreUrlObj.pathname = `/${restoreDbName}`;
  const restoreDbUrl = restoreUrlObj.toString();

  const psqlBin = resolvePgTool('psql');

  // Drop and recreate disposable restore verification database
  execFileSync(
    psqlBin,
    [
      '--dbname',
      adminUrl,
      '-v',
      'ON_ERROR_STOP=1',
      '-c',
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${restoreDbName}' AND pid <> pg_backend_pid();`,
    ],
    { stdio: 'pipe' },
  );
  execFileSync(psqlBin, ['--dbname', adminUrl, '-v', 'ON_ERROR_STOP=1', '-c', `DROP DATABASE IF EXISTS "${restoreDbName}";`], {
    stdio: 'pipe',
  });
  execFileSync(psqlBin, ['--dbname', adminUrl, '-v', 'ON_ERROR_STOP=1', '-c', `CREATE DATABASE "${restoreDbName}";`], {
    stdio: 'pipe',
  });

  const tempDir = path.resolve(rootDir, '.local-restore-verify');
  fs.rmSync(tempDir, { recursive: true, force: true });
  fs.mkdirSync(tempDir, { recursive: true });
  const tempSqlFile = path.join(tempDir, 'restore.sql');
  fs.writeFileSync(tempSqlFile, payload.sqlDump, 'utf8');

  execFileSync(psqlBin, ['--dbname', restoreDbUrl, '-v', 'ON_ERROR_STOP=1', '-f', tempSqlFile], {
    stdio: 'pipe',
  });

  // Restore public & private storage files into disposable verification folder and verify SHA-256
  const verifyPublicDir = path.join(tempDir, 'storage', 'public');
  const verifyPrivateDir = path.join(tempDir, 'storage', 'private');
  fs.mkdirSync(verifyPublicDir, { recursive: true });
  fs.mkdirSync(verifyPrivateDir, { recursive: true });

  let verifiedFilesCount = 0;
  for (const fileEntry of payload.storage.publicFiles || []) {
    const outPath = path.join(verifyPublicDir, fileEntry.relativePath);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    const buf = Buffer.from(fileEntry.base64, 'base64');
    const hash = crypto.createHash('sha256').update(buf).digest('hex');
    if (hash !== fileEntry.sha256) {
      throw new Error(`Public storage file checksum mismatch: ${fileEntry.relativePath}`);
    }
    fs.writeFileSync(outPath, buf);
    verifiedFilesCount += 1;
  }

  for (const fileEntry of payload.storage.privateFiles || []) {
    const outPath = path.join(verifyPrivateDir, fileEntry.relativePath);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    const buf = Buffer.from(fileEntry.base64, 'base64');
    const hash = crypto.createHash('sha256').update(buf).digest('hex');
    if (hash !== fileEntry.sha256) {
      throw new Error(`Private storage file checksum mismatch: ${fileEntry.relativePath}`);
    }
    fs.writeFileSync(outPath, buf);
    verifiedFilesCount += 1;
  }

  // Compare row counts between source DB and restored disposable DB
  const sourcePrisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  const restoredPrisma = new PrismaClient({ datasources: { db: { url: restoreDbUrl } } });

  try {
    const [srcDest, srcTours, srcDeps, srcBookings, srcPages, srcVersions] = await Promise.all([
      sourcePrisma.destination.count(),
      sourcePrisma.tour.count(),
      sourcePrisma.departure.count(),
      sourcePrisma.booking.count(),
      sourcePrisma.cmsPage.count(),
      sourcePrisma.cmsRevision.count(),
    ]);

    const [rstDest, rstTours, rstDeps, rstBookings, rstPages, rstVersions] = await Promise.all([
      restoredPrisma.destination.count(),
      restoredPrisma.tour.count(),
      restoredPrisma.departure.count(),
      restoredPrisma.booking.count(),
      restoredPrisma.cmsPage.count(),
      restoredPrisma.cmsRevision.count(),
    ]);

    const countsMatch =
      srcDest === rstDest &&
      srcTours === rstTours &&
      srcDeps === rstDeps &&
      srcBookings === rstBookings &&
      srcPages === rstPages &&
      srcVersions === rstVersions;

    if (!countsMatch) {
      throw new Error('Restored database row counts did not match source database row counts.');
    }

    const report = {
      status: 'VERIFIED',
      verifiedAt: new Date().toISOString(),
      backupCreatedAt: payload.createdAt,
      encryptionAlgorithm: envelope.algorithm,
      kdf: envelope.kdf,
      sourceDatabase: sourceDbName,
      disposableRestoredDatabase: restoreDbName,
      sqlDumpSha256: payload.sqlDumpSha256,
      verifiedStorageFilesCount: verifiedFilesCount,
      tableCounts: {
        destinations: { source: srcDest, restored: rstDest },
        tours: { source: srcTours, restored: rstTours },
        tourDepartures: { source: srcDeps, restored: rstDeps },
        bookings: { source: srcBookings, restored: rstBookings },
        cmsPages: { source: srcPages, restored: rstPages },
        cmsPageVersions: { source: srcVersions, restored: rstVersions },
      },
      countsMatch,
    };

    const reportDir = path.resolve(rootDir, 'docs', 'qa');
    fs.mkdirSync(reportDir, { recursive: true });
    const reportPath = path.join(reportDir, 'backup-restore-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');

    console.log(JSON.stringify(report));
  } finally {
    await sourcePrisma.$disconnect();
    await restoredPrisma.$disconnect();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error('Restore verification failed:', err.message || err);
  process.exit(1);
});
