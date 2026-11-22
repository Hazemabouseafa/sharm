import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PrismaClient,
  PUBLIC_AUTO_TRANSLATE_TARGETS,
  ensureCleanLiveSiteSettings,
  ensureLiveLegalPagesPublished,
  extractTranslatableStrings,
  translateTextsWithCache,
} from '@sharm/database';

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
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnv();

async function main() {
  const prisma = new PrismaClient();
  try {
    // 1. Clean .example placeholder email and (Demo) labels in SiteSetting & ensure Pay Later is enabled
    await ensureCleanLiveSiteSettings(prisma);

    // 2. Ensure all 4 legal/about pages are published cleanly with customer-ready content
    await ensureLiveLegalPagesPublished(prisma);

    // 3. Extract all catalog + CMS texts and pre-warm PostgreSQL TranslationCache for RU, IT, TR, PL
    const [destinations, tours, categories, addons, pickupZones, policies, pages, globalRow] = await Promise.all([
      prisma.destination.findMany({ where: { isVisible: true } }),
      prisma.tour.findMany({ where: { status: 'PUBLISHED' } }),
      prisma.category.findMany(),
      prisma.addon.findMany(),
      prisma.pickupZone.findMany(),
      prisma.policyVersion.findMany(),
      prisma.cmsPage.findMany({ include: { publishedRevision: true } }),
      prisma.cmsGlobalContent.findUnique({ where: { key: 'site_global' } }),
    ]);

    const allTexts = extractTranslatableStrings({
      destinations,
      tours,
      categories,
      addons,
      pickupZones,
      policies,
      pages: pages.map((p) => p.publishedRevision?.contentJson).filter(Boolean),
      global: globalRow?.publishedJson,
    });

    console.log(`Extracted ${allTexts.length} unique translatable strings across entire site catalog & CMS.`);

    for (const lang of PUBLIC_AUTO_TRANSLATE_TARGETS) {
      const t0 = Date.now();
      await translateTextsWithCache(prisma, allTexts, lang);
      const count = await prisma.translationCache.count({ where: { targetLang: lang } });
      console.log(`Pre-translated [${lang.toUpperCase()}] in ${Date.now() - t0}ms — ${count} cached rows in PostgreSQL.`);
    }

    console.log('Site is prepared for live operation and pre-translated across RU, IT, TR, and PL.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('Failed to prepare live operation:', err);
  process.exit(1);
});
