import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PrismaClient,
  PUBLIC_AUTO_TRANSLATE_TARGETS,
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

const LIVE_LEGAL_PAGES = [
  {
    slug: 'about',
    title: 'About Sharm Pharaoh Travel',
    kind: 'LEGAL',
    heading: 'About Sharm Pharaoh Travel',
    bodyHtml:
      '<p>Sharm Pharaoh Travel is an Egypt-based excursion and destination specialist operating curated marine, desert, and cultural heritage experiences across Sharm El Sheikh, Cairo, Marsa Alam, Hurghada, and Luxor &amp; Aswan.</p>' +
      '<h2>Our Commitment to Travelers</h2>' +
      '<ul><li>Licensed Egyptologists, certified marine guides, and insured modern transfer vehicles.</li><li>Upfront, transparent pricing with zero hidden resort surcharges.</li><li>Real-time departure availability in Cairo operational time (Africa/Cairo) and clear cancellation terms.</li><li>Dedicated guest support from hotel pickup through safe return to your resort or port.</li></ul>',
  },
  {
    slug: 'booking-policy',
    title: 'Booking & Cancellation Policy',
    kind: 'LEGAL',
    heading: 'Booking & Cancellation Policy',
    bodyHtml:
      '<h2>Booking Requests &amp; Confirmation</h2>' +
      '<p>Every reservation receives a unique booking reference and private management link. Pay Later requests temporarily reserve your seats while our operations team verifies availability and sends your official confirmation voucher.</p>' +
      '<h2>Cancellation &amp; Refund Tiers</h2>' +
      '<ul><li><strong>48+ hours before departure:</strong> 100% free cancellation or complimentary date reschedule subject to availability.</li><li><strong>24 to 48 hours before departure:</strong> 50% refund of collected payments or one-time reschedule.</li><li><strong>Less than 24 hours before departure or no-show:</strong> Non-refundable unless the excursion is cancelled due to weather or maritime authority notices, in which case guests receive a full refund or free reschedule.</li></ul>' +
      '<h2>Weather &amp; Marine Safety</h2>' +
      '<p>All boat cruises and diving trips operate under Egyptian Coast Guard and Red Sea Chamber of Diving regulations. If weather conditions require a schedule change, our team notifies guests immediately with full rebooking or refund options.</p>',
  },
  {
    slug: 'privacy',
    title: 'Privacy Policy',
    kind: 'LEGAL',
    heading: 'Privacy Policy',
    bodyHtml:
      '<h2>Information We Collect</h2>' +
      '<p>We collect only the details necessary to arrange your excursions, hotel transfers, and booking communications: lead traveler name, email address, phone or WhatsApp number, hotel pickup name, and any voluntary dietary or accessibility notes.</p>' +
      '<h2>Payment Security</h2>' +
      '<p>Sharm Pharaoh Travel never stores payment card numbers on its servers. Manual bank transfer proofs are stored in private, access-controlled storage visible only to authorized reservations and finance personnel.</p>' +
      '<h2>Your Data Rights</h2>' +
      '<p>You may request access to, correction of, or anonymization of your personal travel data at any time by contacting our reservations desk.</p>',
  },
  {
    slug: 'terms',
    title: 'Terms & Conditions',
    kind: 'LEGAL',
    heading: 'Terms & Conditions',
    bodyHtml:
      '<h2>Scope of Service</h2>' +
      '<p>By submitting a booking request through Sharm Pharaoh Travel, you agree to the tour inclusions, departure schedule (Africa/Cairo timezone), and the exact cancellation policy version displayed at checkout.</p>' +
      '<h2>Traveler Responsibilities</h2>' +
      '<p>Guests are responsible for carrying required identification (such as passports for domestic flights, Ras Mohamed National Park entry, or Luxor/Cairo excursions) and arriving at the confirmed hotel lobby or meeting point on time.</p>' +
      '<h2>Pricing &amp; Currency</h2>' +
      '<p>All quotes are calculated server-side in the displayed currency and locked at the moment your booking is submitted.</p>',
  },
];

async function main() {
  const prisma = new PrismaClient();
  try {
    // 1. Clean .example placeholder email and (Demo) labels in SiteSetting & ensure Pay Later is enabled
    const existingSettings = await prisma.siteSetting.findUnique({ where: { key: 'singleton' } });
    if (existingSettings) {
      const nextEmail =
        !existingSettings.contactEmail || existingSettings.contactEmail.includes('.example')
          ? 'reservations@sharmpharaoh.com'
          : existingSettings.contactEmail;
      const nextPhone = (existingSettings.contactPhone || '').replace(/\s*\(demo\)\s*/gi, '').trim();
      const nextWhatsapp = (existingSettings.whatsappNumber || '').replace(/\s*\(demo\)\s*/gi, '').trim();
      await prisma.siteSetting.update({
        where: { key: 'singleton' },
        data: {
          contactEmail: nextEmail,
          contactPhone: nextPhone,
          whatsappNumber: nextWhatsapp,
          payLaterEnabled: true,
        },
      });
    }

    // 2. Ensure all 4 legal/about pages are published cleanly with customer-ready content
    for (const lp of LIVE_LEGAL_PAGES) {
      let page = await prisma.cmsPage.findUnique({
        where: { slug: lp.slug },
        include: { publishedRevision: true },
      });

      const contentDoc = {
        schemaVersion: 1,
        seo: {
          title: `${lp.title} | Sharm Pharaoh Travel`,
          description: `${lp.title} for Sharm Pharaoh Travel Egypt excursions.`,
          noIndex: false,
        },
        blocks: [
          {
            id: `${lp.slug}-richtext`,
            type: 'RichText',
            label: lp.title,
            hidden: false,
            locked: false,
            style: {
              backgroundToken: 'white',
              textAlign: 'left',
              containerWidth: 'narrow',
              paddingTopPx: 56,
              paddingBottomPx: 64,
              overlayOpacity: 0,
              hideOnMobile: false,
              hideOnTablet: false,
              hideOnDesktop: false,
              fontScale: 'default',
            },
            props: {
              heading: lp.heading,
              bodyHtml: lp.bodyHtml,
            },
          },
        ],
      };

      if (!page) {
        page = await prisma.cmsPage.create({
          data: {
            slug: lp.slug,
            title: lp.title,
            kind: 'LEGAL',
            isSystemProtected: true,
          },
          include: { publishedRevision: true },
        });
      }

      const rawExisting = JSON.stringify(page.publishedRevision?.contentJson ?? {});
      const needsPublish =
        !page.publishedRevisionId ||
        rawExisting.includes('DEMO') ||
        rawExisting.includes('placeholder') ||
        rawExisting.includes('TODO');

      if (needsPublish) {
        const latestRev = await prisma.cmsRevision.findFirst({
          where: { pageId: page.id },
          orderBy: { revisionNumber: 'desc' },
        });
        const nextNum = (latestRev?.revisionNumber ?? 0) + 1;
        const pubRev = await prisma.cmsRevision.create({
          data: {
            pageId: page.id,
            revisionNumber: nextNum,
            status: 'PUBLISHED',
            contentJson: contentDoc,
            schemaVersion: 1,
            publishedAt: new Date(),
            notes: 'Published live customer-ready policy',
          },
        });
        const draftRev = await prisma.cmsRevision.create({
          data: {
            pageId: page.id,
            revisionNumber: nextNum + 1,
            status: 'DRAFT',
            contentJson: contentDoc,
            schemaVersion: 1,
            notes: 'Working draft',
          },
        });
        await prisma.cmsPage.update({
          where: { id: page.id },
          data: {
            publishedRevisionId: pubRev.id,
            currentDraftId: draftRev.id,
            version: { increment: 1 },
          },
        });
        console.log(`Published customer-ready page: /p/${lp.slug}`);
      }
    }

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
