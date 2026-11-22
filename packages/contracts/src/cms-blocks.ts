import { z } from 'zod';

export const CMS_SCHEMA_VERSION = 1;

export const BRAND_COLOR_TOKENS = [
  'petrol',
  'turquoise',
  'gold',
  'ivory',
  'white',
  'slate',
] as const;

export const ColorTokenSchema = z.enum(BRAND_COLOR_TOKENS);

export const SafeHrefSchema = z
  .string()
  .min(1)
  .max(500)
  .refine(
    (val) => {
      const trimmed = val.trim();
      if (trimmed.startsWith('/') && !trimmed.startsWith('//')) return true;
      if (trimmed.startsWith('#')) return true;
      try {
        const u = new URL(trimmed);
        return u.protocol === 'https:' || u.protocol === 'http:' || u.protocol === 'mailto:' || u.protocol === 'tel:';
      } catch {
        return false;
      }
    },
    { message: 'Link must be a safe relative path or http(s)/mailto/tel URL (no javascript: or data:)' },
  );

export const SafeTextSchema = z
  .string()
  .refine(
    (val) => !/<script\b|javascript:|on\w+\s*=|<iframe\b|<object\b|<embed\b/i.test(val),
    { message: 'Disallowed script or unsafe markup detected' },
  );

export const SectionStyleSchema = z
  .object({
    backgroundToken: ColorTokenSchema.default('ivory'),
    textAlign: z.enum(['left', 'center']).default('left'),
    containerWidth: z.enum(['narrow', 'default', 'wide', 'full']).default('default'),
    paddingTopPx: z.number().int().min(0).max(160).default(56),
    paddingBottomPx: z.number().int().min(0).max(160).default(56),
    overlayOpacity: z.number().int().min(0).max(85).default(45),
    hideOnMobile: z.boolean().default(false),
    hideOnTablet: z.boolean().default(false),
    hideOnDesktop: z.boolean().default(false),
    fontScale: z.enum(['compact', 'default', 'editorial']).default('default'),
  })
  .default({});

const BaseBlockFields = {
  id: z.string().min(2).max(64).regex(/^[a-zA-Z0-9_-]+$/),
  label: SafeTextSchema.pipe(z.string().min(1).max(80)).optional(),
  hidden: z.boolean().default(false),
  locked: z.boolean().default(false), // protects required transactional elements from deletion
  style: SectionStyleSchema,
};

export const HeroBlockSchema = z.object({
  ...BaseBlockFields,
  type: z.literal('Hero'),
  props: z.object({
    eyebrow: SafeTextSchema.pipe(z.string().max(80)).optional(),
    headlineAccent: SafeTextSchema.pipe(z.string().max(80)).optional(),
    headline: SafeTextSchema.pipe(z.string().min(2).max(160)),
    subtitle: SafeTextSchema.pipe(z.string().max(260)).default(''),
    imageUrl: SafeHrefSchema,
    imageAlt: SafeTextSchema.pipe(z.string().min(2).max(200)),
    focalPoint: z.object({ x: z.number().min(0).max(100), y: z.number().min(0).max(100) }).default({ x: 50, y: 50 }),
    primaryCtaLabel: SafeTextSchema.pipe(z.string().max(60)).optional(),
    primaryCtaHref: SafeHrefSchema.optional(),
    secondaryCtaLabel: SafeTextSchema.pipe(z.string().max(60)).optional(),
    secondaryCtaHref: SafeHrefSchema.optional(),
    compact: z.boolean().default(false),
  }),
});

export const SearchBarBlockSchema = z.object({
  ...BaseBlockFields,
  type: z.literal('SearchBar'),
  props: z.object({
    destinationLabel: SafeTextSchema.pipe(z.string().max(60)).default('Destination'),
    tourTypeLabel: SafeTextSchema.pipe(z.string().max(60)).default('Tour Type'),
    dateLabel: SafeTextSchema.pipe(z.string().max(60)).default('Date'),
    submitLabel: SafeTextSchema.pipe(z.string().max(60)).default('Find Your Trip'),
    floatingOverlap: z.boolean().default(true),
  }),
});

export const DestinationGridBlockSchema = z.object({
  ...BaseBlockFields,
  type: z.literal('DestinationGrid'),
  props: z.object({
    heading: SafeTextSchema.pipe(z.string().min(1).max(120)).default('Where will you go next?'),
    subheading: SafeTextSchema.pipe(z.string().max(240)).optional(),
    columns: z.number().int().min(2).max(5).default(5),
    orderSlugs: z.array(z.string().min(1).max(80)).max(20).optional(),
  }),
});

export const TourGridBlockSchema = z.object({
  ...BaseBlockFields,
  type: z.literal('TourGrid'),
  props: z.object({
    heading: SafeTextSchema.pipe(z.string().min(1).max(120)).default('Experiences worth travelling for'),
    subheading: SafeTextSchema.pipe(z.string().max(240)).optional(),
    mode: z.enum(['FEATURED', 'DESTINATION', 'CATEGORY', 'CURATED']).default('FEATURED'),
    destinationSlug: z.string().max(80).optional(),
    categorySlug: z.string().max(80).optional(),
    curatedTourSlugs: z.array(z.string().max(120)).max(12).optional(),
    limit: z.number().int().min(1).max(12).default(3),
    columns: z.number().int().min(2).max(4).default(3),
    showPrice: z.boolean().default(true),
  }),
});

export const RichTextBlockSchema = z.object({
  ...BaseBlockFields,
  type: z.literal('RichText'),
  props: z.object({
    heading: SafeTextSchema.pipe(z.string().max(140)).optional(),
    bodyHtml: SafeTextSchema.pipe(z.string().max(25000)),
  }),
});

export const ImageTextBlockSchema = z.object({
  ...BaseBlockFields,
  type: z.literal('ImageText'),
  props: z.object({
    heading: SafeTextSchema.pipe(z.string().min(2).max(140)),
    body: SafeTextSchema.pipe(z.string().min(2).max(1200)),
    imageUrl: SafeHrefSchema,
    imageAlt: SafeTextSchema.pipe(z.string().min(2).max(200)),
    focalPoint: z.object({ x: z.number().min(0).max(100), y: z.number().min(0).max(100) }).default({ x: 50, y: 50 }),
    imagePosition: z.enum(['left', 'right']).default('left'),
    ctaLabel: SafeTextSchema.pipe(z.string().max(60)).optional(),
    ctaHref: SafeHrefSchema.optional(),
  }),
});

export const ImageGalleryBlockSchema = z.object({
  ...BaseBlockFields,
  type: z.literal('ImageGallery'),
  props: z.object({
    heading: SafeTextSchema.pipe(z.string().max(120)).optional(),
    columns: z.number().int().min(2).max(4).default(3),
    items: z
      .array(
        z.object({
          imageUrl: SafeHrefSchema,
          alt: SafeTextSchema.pipe(z.string().min(2).max(200)),
          caption: SafeTextSchema.pipe(z.string().max(160)).optional(),
        }),
      )
      .min(1)
      .max(12),
  }),
});

export const VideoHeroBlockSchema = z.object({
  ...BaseBlockFields,
  type: z.literal('VideoHero'),
  props: z.object({
    headline: SafeTextSchema.pipe(z.string().min(2).max(160)),
    subtitle: SafeTextSchema.pipe(z.string().max(240)).default(''),
    videoUrl: SafeHrefSchema.optional(),
    posterUrl: SafeHrefSchema,
    posterAlt: SafeTextSchema.pipe(z.string().min(2).max(200)),
    ctaLabel: SafeTextSchema.pipe(z.string().max(60)).optional(),
    ctaHref: SafeHrefSchema.optional(),
  }),
});

export const BenefitsBlockSchema = z.object({
  ...BaseBlockFields,
  type: z.literal('Benefits'),
  props: z.object({
    heading: SafeTextSchema.pipe(z.string().min(2).max(120)),
    columns: z.number().int().min(2).max(4).default(3),
    items: z
      .array(
        z.object({
          icon: z.enum(['compass', 'shield', 'clock', 'sparkles', 'anchor', 'map']).default('compass'),
          title: SafeTextSchema.pipe(z.string().min(2).max(80)),
          description: SafeTextSchema.pipe(z.string().min(2).max(260)),
        }),
      )
      .min(1)
      .max(8),
  }),
});

export const FAQBlockSchema = z.object({
  ...BaseBlockFields,
  type: z.literal('FAQ'),
  props: z.object({
    heading: SafeTextSchema.pipe(z.string().min(2).max(120)).default('Frequently Asked Questions'),
    subheading: SafeTextSchema.pipe(z.string().max(200)).optional(),
    bannerImageUrl: SafeHrefSchema.optional(),
    bannerImageAlt: SafeTextSchema.pipe(z.string().max(200)).optional(),
    items: z
      .array(
        z.object({
          question: SafeTextSchema.pipe(z.string().min(3).max(200)),
          answer: SafeTextSchema.pipe(z.string().min(3).max(1500)),
        }),
      )
      .min(1)
      .max(20),
  }),
});

export const CallToActionBlockSchema = z.object({
  ...BaseBlockFields,
  type: z.literal('CallToAction'),
  props: z.object({
    heading: SafeTextSchema.pipe(z.string().min(2).max(140)),
    body: SafeTextSchema.pipe(z.string().max(400)),
    imageUrl: SafeHrefSchema,
    imageAlt: SafeTextSchema.pipe(z.string().min(2).max(200)),
    ctaLabel: SafeTextSchema.pipe(z.string().min(2).max(60)),
    ctaHref: SafeHrefSchema,
  }),
});

export const ContactFormBlockSchema = z.object({
  ...BaseBlockFields,
  type: z.literal('ContactForm'),
  props: z.object({
    heading: SafeTextSchema.pipe(z.string().min(2).max(120)).default('Send Us a Message'),
    subheading: SafeTextSchema.pipe(z.string().max(240)).default("Tell us about your travel plans and we'll get back to you soon."),
    sideHeading: SafeTextSchema.pipe(z.string().max(120)).default('Here to help you explore'),
    sideBody: SafeTextSchema.pipe(z.string().max(400)).default('Our travel team is ready to help you choose the right tour, plan your itinerary, and make your trip to Egypt unforgettable.'),
  }),
});

export const SpacerDividerBlockSchema = z.object({
  ...BaseBlockFields,
  type: z.literal('SpacerDivider'),
  props: z.object({
    heightPx: z.number().int().min(8).max(120).default(32),
    showLine: z.boolean().default(true),
  }),
});

export const CmsBlockSchema = z.discriminatedUnion('type', [
  HeroBlockSchema,
  SearchBarBlockSchema,
  DestinationGridBlockSchema,
  TourGridBlockSchema,
  RichTextBlockSchema,
  ImageTextBlockSchema,
  ImageGalleryBlockSchema,
  VideoHeroBlockSchema,
  BenefitsBlockSchema,
  FAQBlockSchema,
  CallToActionBlockSchema,
  ContactFormBlockSchema,
  SpacerDividerBlockSchema,
]);

export type CmsBlock = z.infer<typeof CmsBlockSchema>;
export type CmsBlockType = CmsBlock['type'];

export const PageSeoSchema = z.object({
  title: SafeTextSchema.pipe(z.string().min(1).max(160)),
  description: SafeTextSchema.pipe(z.string().max(320)).default(''),
  ogImageUrl: SafeHrefSchema.optional(),
  noIndex: z.boolean().default(false),
});

export const PageContentSchema = z.object({
  schemaVersion: z.number().int().min(1).default(CMS_SCHEMA_VERSION),
  seo: PageSeoSchema,
  blocks: z.array(CmsBlockSchema).max(40),
});

export type PageContentDocument = z.infer<typeof PageContentSchema>;

export const GlobalNavLinkSchema = z.object({
  label: SafeTextSchema.pipe(z.string().min(1).max(60)),
  href: SafeHrefSchema,
});

export const GlobalContentSchema = z.object({
  schemaVersion: z.number().int().min(1).default(CMS_SCHEMA_VERSION),
  announcementBar: z.object({
    enabled: z.boolean().default(false),
    text: SafeTextSchema.pipe(z.string().max(180)).default(''),
    href: SafeHrefSchema.optional(),
  }),
  header: z.object({
    navLinks: z.array(GlobalNavLinkSchema).min(1).max(12),
    ctaLabel: SafeTextSchema.pipe(z.string().min(1).max(40)).default('Book a Trip'),
    ctaHref: SafeHrefSchema.default('/tours'),
  }),
  footer: z.object({
    tagline: SafeTextSchema.pipe(z.string().max(220)).default('Curated Red Sea & Heritage Journeys across Egypt.'),
    links: z.array(GlobalNavLinkSchema).max(12),
    legalLinks: z.array(GlobalNavLinkSchema).max(8),
  }),
  theme: z.object({
    petrolHex: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default('#103D45'),
    turquoiseHex: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default('#18A5A0'),
    goldHex: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default('#C9A66B'),
    ivoryHex: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default('#F7F5EF'),
    fontPreset: z.enum(['manrope', 'inter']).default('manrope'),
  }),
});

export type GlobalContentDocument = z.infer<typeof GlobalContentSchema>;

export const CMS_BLOCK_DEFAULTS: Record<CmsBlockType, () => CmsBlock> = {
  Hero: () => ({
    id: `hero-${Date.now().toString(36)}`,
    type: 'Hero',
    label: 'Hero',
    hidden: false,
    locked: false,
    style: { backgroundToken: 'petrol', textAlign: 'left', containerWidth: 'full', paddingTopPx: 72, paddingBottomPx: 72, overlayOpacity: 45, hideOnMobile: false, hideOnTablet: false, hideOnDesktop: false, fontScale: 'default' },
    props: {
      headlineAccent: 'Egypt.',
      headline: 'Every journey tells a story.',
      subtitle: 'From the wonders of the Red Sea to the timeless beauty of the Pharaohs.',
      imageUrl: '/media/hero-red-sea-yacht.webp',
      imageAlt: 'Luxury yacht cruising turquoise Red Sea waters with Sinai mountains in the distance',
      focalPoint: { x: 40, y: 50 },
      primaryCtaLabel: 'Explore Tours',
      primaryCtaHref: '/tours',
      secondaryCtaLabel: 'Discover Destinations',
      secondaryCtaHref: '#destinations',
      compact: false,
    },
  }),
  SearchBar: () => ({
    id: `search-${Date.now().toString(36)}`,
    type: 'SearchBar',
    label: 'Search Bar',
    hidden: false,
    locked: true,
    style: { backgroundToken: 'ivory', textAlign: 'left', containerWidth: 'default', paddingTopPx: 0, paddingBottomPx: 24, overlayOpacity: 0, hideOnMobile: false, hideOnTablet: false, hideOnDesktop: false, fontScale: 'default' },
    props: { destinationLabel: 'Destination', tourTypeLabel: 'Tour Type', dateLabel: 'Date', submitLabel: 'Find Your Trip', floatingOverlap: true },
  }),
  DestinationGrid: () => ({
    id: `destinations-${Date.now().toString(36)}`,
    type: 'DestinationGrid',
    label: 'Destinations',
    hidden: false,
    locked: false,
    style: { backgroundToken: 'ivory', textAlign: 'center', containerWidth: 'default', paddingTopPx: 48, paddingBottomPx: 48, overlayOpacity: 0, hideOnMobile: false, hideOnTablet: false, hideOnDesktop: false, fontScale: 'default' },
    props: { heading: 'Where will you go next?', columns: 5 },
  }),
  TourGrid: () => ({
    id: `tours-${Date.now().toString(36)}`,
    type: 'TourGrid',
    label: 'Featured Tours',
    hidden: false,
    locked: false,
    style: { backgroundToken: 'ivory', textAlign: 'center', containerWidth: 'default', paddingTopPx: 40, paddingBottomPx: 56, overlayOpacity: 0, hideOnMobile: false, hideOnTablet: false, hideOnDesktop: false, fontScale: 'default' },
    props: { heading: 'Experiences worth travelling for', mode: 'FEATURED', limit: 3, columns: 3, showPrice: true },
  }),
  RichText: () => ({
    id: `richtext-${Date.now().toString(36)}`,
    type: 'RichText',
    label: 'Rich Text',
    hidden: false,
    locked: false,
    style: { backgroundToken: 'white', textAlign: 'left', containerWidth: 'narrow', paddingTopPx: 48, paddingBottomPx: 48, overlayOpacity: 0, hideOnMobile: false, hideOnTablet: false, hideOnDesktop: false, fontScale: 'default' },
    props: { heading: 'Editorial Section', bodyHtml: '<p>Share your travel narrative or policy information here.</p>' },
  }),
  ImageText: () => ({
    id: `imagetext-${Date.now().toString(36)}`,
    type: 'ImageText',
    label: 'Image + Text',
    hidden: false,
    locked: false,
    style: { backgroundToken: 'white', textAlign: 'left', containerWidth: 'default', paddingTopPx: 48, paddingBottomPx: 48, overlayOpacity: 0, hideOnMobile: false, hideOnTablet: false, hideOnDesktop: false, fontScale: 'default' },
    props: {
      heading: 'Crafted by Local Experts',
      body: 'Every excursion is thoughtfully timed around local tides, reef visibility, and quiet temple hours.',
      imageUrl: '/media/cairo-pyramids-sphinx.webp',
      imageAlt: 'Great Pyramids of Giza and Sphinx in warm golden sunlight',
      focalPoint: { x: 50, y: 50 },
      imagePosition: 'left',
      ctaLabel: 'Explore Tours',
      ctaHref: '/tours',
    },
  }),
  ImageGallery: () => ({
    id: `gallery-${Date.now().toString(36)}`,
    type: 'ImageGallery',
    label: 'Image Gallery',
    hidden: false,
    locked: false,
    style: { backgroundToken: 'ivory', textAlign: 'center', containerWidth: 'default', paddingTopPx: 48, paddingBottomPx: 48, overlayOpacity: 0, hideOnMobile: false, hideOnTablet: false, hideOnDesktop: false, fontScale: 'default' },
    props: {
      heading: 'Snapshots of Egypt',
      columns: 3,
      items: [
        { imageUrl: '/media/sharm-ras-mohamed-white-island.webp', alt: 'Ras Mohamed and White Island sandbank', caption: 'Ras Mohamed & White Island' },
        { imageUrl: '/media/marsa-abu-dabbab-turtle.webp', alt: 'Green sea turtle gliding over Abu Dabbab reef', caption: 'Abu Dabbab Reef' },
        { imageUrl: '/media/luxor-karnak-temples.webp', alt: 'Karnak Temple sandstone columns in Luxor', caption: 'Karnak Temples' },
      ],
    },
  }),
  VideoHero: () => ({
    id: `videohero-${Date.now().toString(36)}`,
    type: 'VideoHero',
    label: 'Video Hero',
    hidden: false,
    locked: false,
    style: { backgroundToken: 'petrol', textAlign: 'left', containerWidth: 'full', paddingTopPx: 72, paddingBottomPx: 72, overlayOpacity: 50, hideOnMobile: false, hideOnTablet: false, hideOnDesktop: false, fontScale: 'default' },
    props: {
      headline: 'Sail the Red Sea & Ancient Nile',
      subtitle: 'Reduced-motion friendly poster fallback ensures fast loading on all connections.',
      posterUrl: '/media/hero-red-sea-yacht.webp',
      posterAlt: 'Luxury yacht cruising Red Sea reefs',
      ctaLabel: 'Explore Tours',
      ctaHref: '/tours',
    },
  }),
  Benefits: () => ({
    id: `benefits-${Date.now().toString(36)}`,
    type: 'Benefits',
    label: 'Travel Benefits',
    hidden: false,
    locked: false,
    style: { backgroundToken: 'white', textAlign: 'center', containerWidth: 'default', paddingTopPx: 48, paddingBottomPx: 48, overlayOpacity: 0, hideOnMobile: false, hideOnTablet: false, hideOnDesktop: false, fontScale: 'default' },
    props: {
      heading: 'Travel with Clarity & Care',
      columns: 3,
      items: [
        { icon: 'compass', title: 'Verified Local Schedules', description: 'Live departures managed in Cairo time with clear pickup windows.' },
        { icon: 'shield', title: 'Transparent Pricing', description: 'Every fee, add-on, and cancellation term shown upfront before booking.' },
        { icon: 'clock', title: 'Flexible Request Flow', description: 'Reserve now and pay later or via confirmed transfer once availability is approved.' },
      ],
    },
  }),
  FAQ: () => ({
    id: `faq-${Date.now().toString(36)}`,
    type: 'FAQ',
    label: 'FAQ',
    hidden: false,
    locked: false,
    style: { backgroundToken: 'ivory', textAlign: 'left', containerWidth: 'default', paddingTopPx: 48, paddingBottomPx: 56, overlayOpacity: 0, hideOnMobile: false, hideOnTablet: false, hideOnDesktop: false, fontScale: 'default' },
    props: {
      heading: 'Frequently Asked Questions',
      subheading: 'Quick answers to help you plan with confidence.',
      items: [
        { question: 'How does booking confirmation work?', answer: 'Submit your booking request online without creating an account. Our reservations team verifies availability and sends your confirmed PDF voucher by email.' },
        { question: 'Can you customize a private itinerary?', answer: 'Yes. Use our Contact page to tell us your preferred destinations, dates, and group size and our team will prepare a tailored plan.' },
      ],
    },
  }),
  CallToAction: () => ({
    id: `cta-${Date.now().toString(36)}`,
    type: 'CallToAction',
    label: 'Story Banner',
    hidden: false,
    locked: false,
    style: { backgroundToken: 'ivory', textAlign: 'left', containerWidth: 'default', paddingTopPx: 24, paddingBottomPx: 56, overlayOpacity: 0, hideOnMobile: false, hideOnTablet: false, hideOnDesktop: false, fontScale: 'default' },
    props: {
      heading: 'Your journey. Your way.',
      body: 'Tailor your perfect Egypt experience, from Red Sea adventures to ancient wonders across the country.',
      imageUrl: '/media/story-nile-felucca.webp',
      imageAlt: 'Traditional wooden felucca sailing on the Nile at golden sunset near ancient temples',
      ctaLabel: 'Plan Your Trip',
      ctaHref: '/contact',
    },
  }),
  ContactForm: () => ({
    id: `contactform-${Date.now().toString(36)}`,
    type: 'ContactForm',
    label: 'Contact Form',
    hidden: false,
    locked: true,
    style: { backgroundToken: 'ivory', textAlign: 'left', containerWidth: 'default', paddingTopPx: 40, paddingBottomPx: 48, overlayOpacity: 0, hideOnMobile: false, hideOnTablet: false, hideOnDesktop: false, fontScale: 'default' },
    props: {
      heading: 'Send Us a Message',
      subheading: "Tell us about your travel plans and we'll get back to you soon.",
      sideHeading: 'Here to help you explore',
      sideBody: 'Our travel team is ready to help you choose the right tour, plan your itinerary, and make your trip to Egypt unforgettable.',
    },
  }),
  SpacerDivider: () => ({
    id: `divider-${Date.now().toString(36)}`,
    type: 'SpacerDivider',
    label: 'Divider',
    hidden: false,
    locked: false,
    style: { backgroundToken: 'ivory', textAlign: 'center', containerWidth: 'default', paddingTopPx: 8, paddingBottomPx: 8, overlayOpacity: 0, hideOnMobile: false, hideOnTablet: false, hideOnDesktop: false, fontScale: 'default' },
    props: { heightPx: 24, showLine: true },
  }),
};

/**
 * Reserved system route slugs that CMS custom pages cannot capture.
 */
export const RESERVED_SLUGS = new Set([
  'admin',
  'api',
  'tours',
  'destinations',
  'checkout',
  'booking',
  'contact',
  'preview',
  'p',
  'sitemap.xml',
  'robots.txt',
  'health',
  '_next',
]);
