import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PrismaClient,
  ensureCleanLiveSiteSettings,
  ensureLiveLegalPagesPublished,
  provisionInitialOwnerFromEnv,
  runProductionInit,
  seedStorefrontCatalogAndCms,
} from '@sharm/database';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

function loadLocalEnv() {
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
    if (process.env[key] === undefined) {
      process.env[key] = val;
    }
  }
}

loadLocalEnv();

async function main() {
  const prisma = new PrismaClient();
  try {
    console.log('[bootstrap] Running idempotent production baseline initialization...');
    await runProductionInit(prisma);

    await ensureCleanLiveSiteSettings(prisma);

    if (process.env.BOOTSTRAP_CATALOG !== 'false') {
      console.log('[bootstrap] Ensuring live Egypt storefront catalog, rolling Cairo schedules, and CMS pages...');
      await seedStorefrontCatalogAndCms(prisma, { demoMode: false });
    }

    await ensureLiveLegalPagesPublished(prisma);

    const ownerResult = await provisionInitialOwnerFromEnv(prisma);
    if (ownerResult.created) {
      console.log(`[bootstrap] Initial OWNER provisioned (${ownerResult.username ?? ownerResult.email} / ${ownerResult.email}).`);
    } else if (ownerResult.email) {
      console.log(`[bootstrap] Active OWNER already exists (${ownerResult.username ?? ownerResult.email}); keeping existing credentials.`);
    } else {
      console.log('[bootstrap] No INITIAL_ADMIN_PASSWORD set; create an owner later via: node scripts/create-admin.mjs --email owner@yourdomain.com');
    }

    console.log('[bootstrap] Coolify / production database initialization completed successfully.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('[bootstrap] Fatal initialization error:', err);
  process.exit(1);
});
