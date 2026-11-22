import 'dotenv/config';
import { PrismaClient, Prisma } from '@prisma/client';
import { CMS_SCHEMA_VERSION, GlobalContentDocument, PageContentDocument } from '@sharm/contracts';

/**
 * Minimal production-safe initialization.
 * - Creates SiteSetting singleton with blank business contacts (owner must fill before launch).
 * - Creates baseline reusable PolicyDocument/PolicyVersion (marked requiring owner review).
 * - Creates GlobalContent & minimal CMS scaffolds without demo tours, fake reviews, or default admin passwords.
 */
export async function runProductionInit(client: PrismaClient): Promise<void> {
  await client.siteSetting.upsert({
    where: { key: 'singleton' },
    update: {},
    create: {
      key: 'singleton',
      companyName: 'Sharm Pharaoh Travel',
      legalName: '',
      baseCurrency: 'USD',
      timezone: 'Africa/Cairo',
      contactEmail: '',
      contactPhone: '',
      whatsappNumber: '',
      addressText: '',
      mapEmbedUrl: '',
      socialsJson: {},
      payLaterEnabled: true,
      bankTransferEnabled: false,
      bankDetailsJson: {},
      manualRequestHoldHours: 24,
      onlineCheckoutHoldMinutes: 15,
      defaultTaxIncluded: true,
      defaultTaxRateBps: 0,
      maintenanceBannerEnabled: false,
      maintenanceBannerText: '',
      seoDefaultsJson: {
        siteTitleSuffix: 'Sharm Pharaoh Travel',
        defaultDescription: 'Curated Red Sea excursions and heritage journeys across Egypt.',
      },
      emailTemplatesJson: {
        booking_requested: {
          subject: 'Booking Request Received — {{reference}} (Awaiting Confirmation)',
          intro: 'Thank you for your booking request with Sharm Pharaoh Travel. Your booking is NOT yet confirmed until our reservations team verifies availability.',
        },
        booking_confirmed: {
          subject: 'Booking Confirmed — {{reference}} | Sharm Pharaoh Travel',
          intro: 'Great news! Your booking has been confirmed. Your official voucher is available via your secure booking link.',
        },
        booking_cancelled: {
          subject: 'Booking Cancelled — {{reference}} | Sharm Pharaoh Travel',
          intro: 'Your booking has been cancelled according to the applicable policy terms.',
        },
        booking_expired: {
          subject: 'Booking Hold Expired — {{reference}} | Sharm Pharaoh Travel',
          intro: 'Your temporary booking hold or request deadline has expired and seats have been released.',
        },
        inquiry_received: {
          subject: 'We received your travel inquiry — Sharm Pharaoh Travel',
          intro: 'Thank you for reaching out. Our travel advisors will review your plans and reply shortly.',
        },
      },
      paymobNonSecretConfigJson: {
        enabled: false,
        sandboxVerified: false,
        currency: 'USD',
        integrationId: '',
        callbackUrl: '',
      },
    },
  });

  const defaultPolicy = await client.policyDocument.upsert({
    where: { code: 'standard-24h-flexible' },
    update: {},
    create: {
      code: 'standard-24h-flexible',
      name: 'Standard Flexible Policy (24h Free Cancellation)',
      summary: 'Free cancellation up to 24 hours before departure (Africa/Cairo time). 50% refund between 12 and 24 hours. Non-refundable within 12 hours.',
      freeCancellationHours: 24,
      partialRefundHours: 12,
      partialRefundPercentBps: 5000,
    },
  });

  await client.policyVersion.upsert({
    where: { policyId_versionNumber: { policyId: defaultPolicy.id, versionNumber: 1 } },
    update: {},
    create: {
      policyId: defaultPolicy.id,
      versionNumber: 1,
      title: 'Standard Flexible Booking & Cancellation Policy (v1 — Draft Pending Owner Legal Review)',
      bodyMarkdown:
        'NOTICE: Draft policy requiring business owner and legal review prior to commercial launch.\n\n' +
        '1. Request & Confirmation: Unless explicitly enabled for instant confirmation, submitting a booking request holds seats temporarily until our reservations team approves availability within the stated review window.\n' +
        '2. Free Cancellation: Cancel at least 24 hours prior to the scheduled departure time in Africa/Cairo timezone for a full refund of any collected payment.\n' +
        '3. Partial Refund Window: Cancellations between 12 and 24 hours prior to departure qualify for a 50% refund of collected payments.\n' +
        '4. Late Cancellations & No-Show: Cancellations within 12 hours of departure or no-shows are non-refundable unless overridden by management for force majeure or operator cancellation.',
      freeCancellationHours: 24,
      partialRefundHours: 12,
      partialRefundPercentBps: 5000,
    },
  });

  const globalDoc: GlobalContentDocument = {
    schemaVersion: CMS_SCHEMA_VERSION,
    announcementBar: {
      enabled: false,
      text: '',
    },
    header: {
      navLinks: [
        { label: 'Home', href: '/' },
        { label: 'Tours', href: '/tours' },
        { label: 'Cairo', href: '/destinations/cairo' },
        { label: 'Sharm El Sheikh', href: '/destinations/sharm-el-sheikh' },
        { label: 'Marsa Alam', href: '/destinations/marsa-alam' },
        { label: 'Hurghada', href: '/destinations/hurghada' },
        { label: 'Luxor & Aswan', href: '/destinations/luxor-aswan' },
        { label: 'Contact', href: '/contact' },
      ],
      ctaLabel: 'Book a Trip',
      ctaHref: '/tours',
    },
    footer: {
      tagline: 'From the wonders of the Red Sea to the timeless beauty of the Pharaohs.',
      links: [
        { label: 'Home', href: '/' },
        { label: 'Tours', href: '/tours' },
        { label: 'Cairo', href: '/destinations/cairo' },
        { label: 'Sharm El Sheikh', href: '/destinations/sharm-el-sheikh' },
        { label: 'Marsa Alam', href: '/destinations/marsa-alam' },
        { label: 'Hurghada', href: '/destinations/hurghada' },
        { label: 'Luxor & Aswan', href: '/destinations/luxor-aswan' },
        { label: 'Contact', href: '/contact' },
      ],
      legalLinks: [
        { label: 'About Us', href: '/p/about' },
        { label: 'Privacy Policy', href: '/p/privacy' },
        { label: 'Terms of Service', href: '/p/terms' },
        { label: 'Booking & Cancellation Policy', href: '/p/booking-policy' },
        { label: 'Manage Booking', href: '/booking/manage' },
      ],
    },
    theme: {
      petrolHex: '#103D45',
      turquoiseHex: '#18A5A0',
      goldHex: '#C9A66B',
      ivoryHex: '#F7F5EF',
      fontPreset: 'manrope',
    },
  };

  await client.cmsGlobalContent.upsert({
    where: { key: 'site_global' },
    update: {},
    create: {
      key: 'site_global',
      draftJson: globalDoc as unknown as Prisma.InputJsonValue,
      publishedJson: globalDoc as unknown as Prisma.InputJsonValue,
      publishedRevisionNumber: 1,
    },
  });

  const legalPages: Array<{ slug: string; title: string; heading: string; html: string }> = [
    {
      slug: 'privacy',
      title: 'Privacy Policy',
      heading: 'Privacy Policy',
      html: '<p><strong>Owner Review Notice:</strong> This policy draft is provided as an operational starting template and requires legal review by the business owner before commercial launch.</p><h3>Information We Collect</h3><p>When you submit a booking request or travel inquiry, we collect only operational details required to arrange your excursion: lead traveler name, email address, phone number, pickup hotel or meeting location, party composition, and any special accessibility or dietary notes you choose to provide. We do not collect or store payment card numbers or passport scans through our booking checkout.</p><h3>Data Retention &amp; Requests</h3><p>Financial booking records are retained in accordance with applicable tax and accounting obligations, while traveler personal identifiers may be exported or anonymized upon verified request through our staff operations portal.</p>',
    },
    {
      slug: 'terms',
      title: 'Terms of Service',
      heading: 'Terms of Service',
      html: '<p><strong>Owner Review Notice:</strong> This Terms of Service draft requires review and approval by the business owner before going live.</p><h3>Booking Requests &amp; Confirmation</h3><p>All booking requests are subject to live departure capacity and operational confirmation. A booking is confirmed only when you receive an official confirmation notice and PDF voucher from Sharm Pharaoh Travel.</p><h3>Pricing &amp; Currency</h3><p>All displayed prices are quoted in the configured base currency with taxes, surcharges, and optional add-ons itemized transparently prior to submission.</p>',
    },
    {
      slug: 'booking-policy',
      title: 'Booking & Cancellation Policy',
      heading: 'Booking & Cancellation Policy',
      html: '<p><strong>Owner Review Notice:</strong> Verify that these policy thresholds match your configured tour policy rules before accepting commercial bookings.</p><h3>Request Deadlines &amp; Holds</h3><p>Manual pay-later and bank-transfer booking requests hold requested seats for the review window specified at checkout (default 24 hours). Online checkout holds expire automatically after 15 minutes if payment is not completed.</p><h3>Cancellations &amp; Rescheduling</h3><p>Standard tours allow free cancellation up to 24 hours before the scheduled departure time in Africa/Cairo local time, a 50% refund between 12 and 24 hours, and are non-refundable within 12 hours. Specific tours (such as private charters) may carry their own versioned policy presented and accepted during checkout.</p>',
    },
    {
      slug: 'about',
      title: 'About Sharm Pharaoh Travel',
      heading: 'About Sharm Pharaoh Travel',
      html: '<p><strong>Owner Review Notice:</strong> Update this page in the Live Editor with your verified company registration, license number, and team story prior to launch.</p><p>Sharm Pharaoh Travel connects discerning travelers with Egypt&apos;s Red Sea marine parks and ancient Nile heritage sites through transparent scheduling, local operational expertise, and responsive guest care.</p>',
    },
  ];

  for (const lp of legalPages) {
    const existing = await client.cmsPage.findUnique({ where: { slug: lp.slug } });
    if (!existing) {
      const content: PageContentDocument = {
        schemaVersion: CMS_SCHEMA_VERSION,
        seo: { title: `${lp.title} | Sharm Pharaoh Travel`, description: `${lp.title} for Sharm Pharaoh Travel.`, noIndex: false },
        blocks: [
          {
            id: `${lp.slug}-body`,
            type: 'RichText',
            label: lp.title,
            hidden: false,
            locked: false,
            style: { backgroundToken: 'white', textAlign: 'left', containerWidth: 'narrow', paddingTopPx: 56, paddingBottomPx: 64, overlayOpacity: 0, hideOnMobile: false, hideOnTablet: false, hideOnDesktop: false, fontScale: 'default' },
            props: { heading: lp.heading, bodyHtml: lp.html },
          },
        ],
      };

      const page = await client.cmsPage.create({
        data: { slug: lp.slug, kind: 'LEGAL', title: lp.title, isSystemProtected: true },
      });
      const rev = await client.cmsRevision.create({
        data: {
          pageId: page.id,
          revisionNumber: 1,
          status: 'PUBLISHED',
          contentJson: content as unknown as Prisma.InputJsonValue,
          schemaVersion: CMS_SCHEMA_VERSION,
          publishedAt: new Date(),
          notes: 'Initial legal policy scaffold (requires owner review)',
        },
      });
      await client.cmsPage.update({
        where: { id: page.id },
        data: { publishedRevisionId: rev.id, currentDraftId: rev.id },
      });
    }
  }
}

if (require.main === module) {
  const client = new PrismaClient();
  runProductionInit(client)
    .then(() => {
      console.log('Production baseline initialization complete (no demo tours or default passwords created).');
    })
    .catch((err) => {
      console.error('Production init failed:', err);
      process.exitCode = 1;
    })
    .finally(() => client.$disconnect());
}
