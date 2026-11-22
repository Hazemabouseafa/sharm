import crypto from 'crypto';
import argon2 from 'argon2';
import { PrismaClient, Prisma, PricingMode } from '@prisma/client';
import {
  CMS_SCHEMA_VERSION,
  PageContentDocument,
  cairoLocalToUtc,
  generateRecurringCairoDates,
  todayInCairo,
} from '@sharm/contracts';

export const LIVE_LEGAL_PAGES: Array<{
  slug: string;
  title: string;
  heading: string;
  bodyHtml: string;
}> = [
  {
    slug: 'about',
    title: 'About Sharm Pharaoh Travel',
    heading: 'About Sharm Pharaoh Travel',
    bodyHtml:
      '<p>Sharm Pharaoh Travel is an Egypt-based excursion and destination specialist operating curated marine, desert, and cultural heritage experiences across Sharm El Sheikh, Cairo, Marsa Alam, Hurghada, and Luxor &amp; Aswan.</p>' +
      '<h2>Our Commitment to Travelers</h2>' +
      '<ul><li>Licensed Egyptologists, certified marine guides, and insured modern transfer vehicles.</li><li>Upfront, transparent pricing with zero hidden resort surcharges.</li><li>Real-time departure availability in Cairo operational time (Africa/Cairo) and clear cancellation terms.</li><li>Dedicated guest support from hotel pickup through safe return to your resort or port.</li></ul>',
  },
  {
    slug: 'booking-policy',
    title: 'Booking & Cancellation Policy',
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

export async function upsertPublishedPage(
  client: PrismaClient,
  params: {
    slug: string;
    kind: 'HOME' | 'TOURS' | 'DESTINATION' | 'CONTACT' | 'LEGAL' | 'CUSTOM';
    title: string;
    destinationId?: string;
    isSystemProtected?: boolean;
    notes?: string;
    content: PageContentDocument;
  },
) {
  const existing = await client.cmsPage.findUnique({ where: { slug: params.slug } });
  if (existing) return existing;

  const page = await client.cmsPage.create({
    data: {
      slug: params.slug,
      kind: params.kind,
      title: params.title,
      destinationId: params.destinationId ?? null,
      isSystemProtected: params.isSystemProtected ?? true,
    },
  });

  const rev = await client.cmsRevision.create({
    data: {
      pageId: page.id,
      revisionNumber: 1,
      status: 'PUBLISHED',
      contentJson: params.content as unknown as Prisma.InputJsonValue,
      schemaVersion: CMS_SCHEMA_VERSION,
      publishedAt: new Date(),
      notes: params.notes ?? 'Initial storefront published revision',
    },
  });

  return client.cmsPage.update({
    where: { id: page.id },
    data: {
      publishedRevisionId: rev.id,
      currentDraftId: rev.id,
    },
  });
}

export async function seedStorefrontCatalogAndCms(
  client: PrismaClient,
  opts: { demoMode: boolean },
): Promise<{
  standardPolicyV1Id: string;
  toursMap: Map<string, { id: string; firstDepartureId: string }>;
}> {
  // Policies
  const standardPolicy = await client.policyDocument.findUniqueOrThrow({ where: { code: 'standard-24h-flexible' } });
  const standardPolicyV1 = await client.policyVersion.findFirstOrThrow({ where: { policyId: standardPolicy.id } });

  const charterPolicy = await client.policyDocument.upsert({
    where: { code: 'private-charter-48h' },
    update: {},
    create: {
      code: 'private-charter-48h',
      name: 'Private Charter Policy (48h Free Cancellation)',
      summary: 'Free cancellation up to 48 hours before departure (Africa/Cairo time). 50% refund between 24 and 48 hours. Non-refundable within 24 hours.',
      freeCancellationHours: 48,
      partialRefundHours: 24,
      partialRefundPercentBps: 5000,
    },
  });
  await client.policyVersion.upsert({
    where: { policyId_versionNumber: { policyId: charterPolicy.id, versionNumber: 1 } },
    update: {},
    create: {
      policyId: charterPolicy.id,
      versionNumber: 1,
      title: opts.demoMode ? 'Private Charter Booking & Cancellation Policy (v1 — Draft Pending Owner Review)' : 'Private Charter Booking & Cancellation Policy (v1)',
      bodyMarkdown:
        'Free cancellation up to 48 hours prior to Africa/Cairo departure time. Cancellations between 24 and 48 hours receive a 50% refund of collected deposits/payments. Cancellations under 24 hours are non-refundable unless cancelled by the operator due to maritime weather advisories.',
      freeCancellationHours: 48,
      partialRefundHours: 24,
      partialRefundPercentBps: 5000,
    },
  });

  // Categories
  const categorySpecs = [
    { slug: 'beach-tours', name: 'Beach & Island Tours', icon: 'umbrella', description: 'Sunlit sandbanks, turquoise coves, and relaxing Red Sea beaches.', displayOrder: 1 },
    { slug: 'cultural-tours', name: 'Cultural & Heritage', icon: 'landmark', description: 'Pyramids, temples, museums, and guided Egyptian history.', displayOrder: 2 },
    { slug: 'diving-snorkeling', name: 'Diving & Snorkeling', icon: 'waves', description: 'Coral reef gardens, sea turtles, and marine park excursions.', displayOrder: 3 },
    { slug: 'safari-tours', name: 'Desert Safari', icon: 'mountain', description: '4x4 Sinai and Eastern Desert dunes with Bedouin hospitality.', displayOrder: 4 },
    { slug: 'adventure-tours', name: 'Yacht & Boat Cruises', icon: 'ship', description: 'Full-day Red Sea yacht charters and open-sea voyages.', displayOrder: 5 },
    { slug: 'nile-cruises', name: 'Nile Experiences', icon: 'compass', description: 'Sunset felucca sails and evening cruises along the Nile.', displayOrder: 6 },
  ];
  const categories = new Map<string, string>();
  for (const c of categorySpecs) {
    const row = await client.category.upsert({ where: { slug: c.slug }, update: {}, create: c });
    categories.set(c.slug, row.id);
  }

  // Exact 5 required initial destinations (card display order follows corrected 01_Home_EN.png)
  const destinationSpecs = [
    {
      slug: 'luxor-aswan',
      name: 'Luxor & Aswan',
      tagline: 'Journey into the heart of history.',
      heroSubtitle: 'Monumental sandstone temples, royal tombs, and timeless felucca sails along the Nile.',
      description: 'Explore Upper Egypt from the colossal hypostyle hall of Karnak and the painted corridors of the Valley of the Kings to Philae Island rising from the sapphire Nile in Aswan.',
      heroImageUrl: '/media/luxor-karnak-temples.webp',
      heroImageAlt: 'Monumental ancient sandstone columns and pharaoh statue at Karnak Temple in Luxor',
      displayOrder: 1,
      highlightsJson: ['Karnak & Luxor Temple complexes', 'Valley of the Kings royal tombs', 'Philae Temple on Agilkia Island', 'Sunset Nile felucca sailing'],
      faqJson: [
        { question: 'What is the best time of day to visit Karnak and the Valley of the Kings?', answer: 'Early morning departures avoid midday heat and offer the clearest golden light for temple photography.' },
        { question: 'Are licensed Egyptologist guides included?', answer: 'Yes, our Luxor and Aswan cultural tours include an English-speaking licensed Egyptologist guide.' },
      ],
    },
    {
      slug: 'hurghada',
      name: 'Hurghada',
      tagline: 'Beautiful islands. Everyday adventures.',
      heroSubtitle: 'Shallow turquoise island lagoons, vibrant Giftun coral reefs, and golden Eastern Desert dunes.',
      description: 'Discover Hurghada’s celebrated Red Sea coastline with full-day cruises to Orange Bay and Giftun Islands, crystal reef snorkeling, and desert safaris beyond the coastal mountains.',
      heroImageUrl: '/media/hurghada-orange-bay.webp',
      heroImageAlt: 'Shallow turquoise beach lagoon with palm umbrellas at Orange Bay in Hurghada',
      displayOrder: 2,
      highlightsJson: ['Orange Bay crystal sandbanks', 'Giftun Islands Marine Park reefs', 'Eastern Desert 4x4 & quad safaris', 'Calm shallow snorkeling lagoons'],
      faqJson: [
        { question: 'Is Orange Bay suitable for families with children?', answer: 'Yes, Orange Bay features calm, waist-deep turquoise shallows and shaded beach seating ideal for families.' },
      ],
    },
    {
      slug: 'marsa-alam',
      name: 'Marsa Alam',
      tagline: 'Untouched nature. Endless blue.',
      heroSubtitle: 'Swim alongside green sea turtles at Abu Dabbab, spinner dolphins at Sataya Reef, and virgin Hamata lagoons.',
      description: 'Marsa Alam offers Egypt’s most unspoiled southern Red Sea reefs, renowned for gentle seagrass bays, wild dolphin lagoons, and pristine offshore islands.',
      heroImageUrl: '/media/marsa-abu-dabbab-turtle.webp',
      heroImageAlt: 'Green sea turtle swimming over colorful coral reefs in Marsa Alam turquoise water',
      displayOrder: 3,
      highlightsJson: ['Abu Dabbab sea turtle bay', 'Sataya Dolphin Reef wild lagoon', 'Hamata Islands untouched sandbars', 'Pristine southern Red Sea diving'],
      faqJson: [
        { question: 'Are dolphin sightings at Sataya Reef guaranteed?', answer: 'Sataya is home to a resident pod of wild spinner dolphins with very high sighting rates, though wildlife encounters are always natural and respectful.' },
      ],
    },
    {
      slug: 'sharm-el-sheikh',
      name: 'Sharm El Sheikh',
      tagline: 'Where the sea meets adventure.',
      heroSubtitle: 'Coral walls of Ras Mohamed, the luminous sandbar of White Island, and rugged Sinai mountain safaris.',
      description: 'Set between the Sinai mountains and the Straits of Tiran, Sharm El Sheikh pairs world-renowned marine reserves with luxury yacht days and Bedouin desert sunsets.',
      heroImageUrl: '/media/sharm-ras-mohamed-white-island.webp',
      heroImageAlt: 'Ras Mohamed headland and White Island sandbar surrounded by turquoise Red Sea waters in Sharm El Sheikh',
      displayOrder: 4,
      highlightsJson: ['Ras Mohamed National Park reefs', 'White Island gleaming sandbar', 'Red Sea scuba diving sites', 'Sinai desert 4x4 sunset safaris'],
      faqJson: [
        { question: 'Is hotel pickup included in Sharm El Sheikh?', answer: 'Standard pickup from Naama Bay, Sharks Bay, and Hadaba resorts is included on most excursions, with optional private transfers available.' },
      ],
    },
    {
      slug: 'cairo',
      name: 'Cairo',
      tagline: 'Stories from the heart of civilisation.',
      heroSubtitle: 'Stand before the Great Pyramids of Giza, explore the Grand Egyptian Museum, and wander historic Old Cairo.',
      description: 'Uncover five millennia of living history across the Giza Plateau, Cairo’s world-class museums, lantern-lit bazaars, and serene evening sails along the Nile.',
      heroImageUrl: '/media/cairo-pyramids-sphinx.webp',
      heroImageAlt: 'Great Pyramids of Giza and the Great Sphinx illuminated in golden-hour sunlight in Cairo',
      displayOrder: 5,
      highlightsJson: ['Great Pyramids & Sphinx of Giza', 'Grand Egyptian Museum galleries', 'Old Cairo & Khan El Khalili bazaar', 'Golden-hour Nile cruises'],
      faqJson: [
        { question: 'Are museum and plateau entrance fees included?', answer: 'Check each tour’s Inclusions section for exact ticket coverage; all fees and optional upgrades are listed transparently before booking.' },
      ],
    },
  ];

  const destinations = new Map<string, string>();
  for (const d of destinationSpecs) {
    const row = await client.destination.upsert({ where: { slug: d.slug }, update: {}, create: d });
    destinations.set(d.slug, row.id);
  }

  // Reusable Add-ons
  const addonSpecs = [
    { code: 'private-transfer', title: 'Private Hotel Transfer (Round-Trip)', description: 'Dedicated air-conditioned vehicle between your hotel and departure point.', pricingBasis: 'PER_BOOKING' as const, priceMinor: 2000, currency: 'USD', maxQuantity: 1 },
    { code: 'snorkel-kit', title: 'Premium Mask, Fins & Wetsuit Kit', description: 'Sanitized fitted snorkeling equipment and shorty wetsuit.', pricingBasis: 'PER_PERSON' as const, priceMinor: 1000, currency: 'USD', maxQuantity: 1 },
    { code: 'photo-package', title: 'Underwater & Scenic Photo Package', description: 'Edited high-resolution digital gallery captured during your excursion.', pricingBasis: 'PER_BOOKING' as const, priceMinor: 3500, currency: 'USD', maxQuantity: 1 },
    { code: 'private-egyptologist', title: 'Private Licensed Egyptologist Guide', description: 'Dedicated historian guiding only your group at your preferred pace.', pricingBasis: 'PER_BOOKING' as const, priceMinor: 6500, currency: 'USD', maxQuantity: 1 },
    { code: 'seafood-lunch-upgrade', title: 'Grilled Seafood Lunch Upgrade', description: 'Freshly prepared Red Sea seafood platter served onboard.', pricingBasis: 'PER_PERSON' as const, priceMinor: 1800, currency: 'USD', maxQuantity: 1 },
  ];
  const addons = new Map<string, string>();
  for (const a of addonSpecs) {
    const row = await client.addon.upsert({ where: { code: a.code }, update: {}, create: a });
    addons.set(a.code, row.id);
  }

  // Pickup Zones per Destination
  const pickupSpecs = [
    { dest: 'sharm-el-sheikh', name: 'Naama Bay & Sharks Bay Hotels (Included)', surchargeMinor: 0, pricingBasis: 'PER_BOOKING' as const, requiresHotelDetails: true },
    { dest: 'sharm-el-sheikh', name: 'Nabq Bay Resort Area', surchargeMinor: 1000, pricingBasis: 'PER_BOOKING' as const, requiresHotelDetails: true },
    { dest: 'sharm-el-sheikh', name: 'Direct Marina Meeting Point (No Pickup)', surchargeMinor: 0, pricingBasis: 'PER_BOOKING' as const, requiresHotelDetails: false },
    { dest: 'cairo', name: 'Central Cairo & Giza Hotels (Included)', surchargeMinor: 0, pricingBasis: 'PER_BOOKING' as const, requiresHotelDetails: true },
    { dest: 'cairo', name: 'New Cairo / Cairo Airport Zone', surchargeMinor: 1500, pricingBasis: 'PER_BOOKING' as const, requiresHotelDetails: true },
    { dest: 'marsa-alam', name: 'Port Ghalib & Coraya Bay Resorts (Included)', surchargeMinor: 0, pricingBasis: 'PER_BOOKING' as const, requiresHotelDetails: true },
    { dest: 'marsa-alam', name: 'South Marsa Alam / Wadi Lahami Hotels', surchargeMinor: 1500, pricingBasis: 'PER_BOOKING' as const, requiresHotelDetails: true },
    { dest: 'hurghada', name: 'Hurghada Central & Marina Hotels (Included)', surchargeMinor: 0, pricingBasis: 'PER_BOOKING' as const, requiresHotelDetails: true },
    { dest: 'hurghada', name: 'El Gouna / Makadi Bay / Sahl Hasheesh', surchargeMinor: 1200, pricingBasis: 'PER_BOOKING' as const, requiresHotelDetails: true },
    { dest: 'luxor-aswan', name: 'Luxor East Bank / Aswan Corniche Hotels (Included)', surchargeMinor: 0, pricingBasis: 'PER_BOOKING' as const, requiresHotelDetails: true },
    { dest: 'luxor-aswan', name: 'Luxor West Bank Pickup', surchargeMinor: 1000, pricingBasis: 'PER_BOOKING' as const, requiresHotelDetails: true },
  ];
  const pickupsByDest = new Map<string, string[]>();
  for (const p of pickupSpecs) {
    const destId = destinations.get(p.dest)!;
    const row = await client.pickupZone.upsert({
      where: { destinationId_name: { destinationId: destId, name: p.name } },
      update: {},
      create: {
        destinationId: destId,
        name: p.name,
        surchargeMinor: p.surchargeMinor,
        pricingBasis: p.pricingBasis,
        requiresHotelDetails: p.requiresHotelDetails,
      },
    });
    const list = pickupsByDest.get(p.dest) ?? [];
    list.push(row.id);
    pickupsByDest.set(p.dest, list);
  }

  const standardAgeBands = (adult: number, child: number, infant = 0) => [
    { code: 'ADULT', label: 'Adult (12+ yrs)', minAge: 12, maxAge: null, priceMinor: adult, consumesSeat: true },
    { code: 'CHILD', label: 'Child (4–11 yrs)', minAge: 4, maxAge: 11, priceMinor: child, consumesSeat: true },
    { code: 'INFANT', label: 'Infant (0–3 yrs)', minAge: 0, maxAge: 3, priceMinor: infant, consumesSeat: false },
  ];

  // 16 Coherent Tours across all 5 destinations (100% semantically accurate images!)
  const tourSpecs = [
    {
      slug: 'ras-mohamed-white-island',
      dest: 'sharm-el-sheikh',
      title: 'Ras Mohamed & White Island',
      featured: true,
      displayOrder: 1,
      durationLabel: 'Full Day',
      durationHours: 8,
      pricingMode: 'PER_PERSON' as PricingMode,
      ageBands: standardAgeBands(6000, 3500, 0),
      privateGroupPriceMinor: null,
      depositEnabled: true,
      depositPercentBps: 2500,
      instantConfirmPayLater: false,
      cats: ['beach-tours', 'diving-snorkeling', 'adventure-tours'],
      addons: ['private-transfer', 'snorkel-kit', 'photo-package', 'seafood-lunch-upgrade'],
      image: '/media/sharm-ras-mohamed-white-island.webp',
      alt: 'Ras Mohamed National Park coastline and White Island sandbank in crystal-clear turquoise water',
      gallery: [
        { url: '/media/sharm-ras-mohamed-white-island.webp', alt: 'Ras Mohamed and White Island sandbank' },
        { url: '/media/sharm-luxury-yacht-cruise.webp', alt: 'Luxury excursion yacht cruising Sharm El Sheikh coast' },
        { url: '/media/sharm-scuba-coral-reef.webp', alt: 'Vibrant coral reef life beneath the Red Sea' },
      ],
      shortDescription: 'Full-day boat trip to Ras Mohamed National Park and the luminous sandbank of White Island with guided reef snorkeling and lunch onboard.',
      meetingPoint: 'Travco Marina, Sharm El Sheikh (or included hotel pickup)',
      itinerary: [
        { step: 1, title: 'Hotel pickup', description: 'Morning transfer from your Sharm El Sheikh resort to the marina.' },
        { step: 2, title: 'Reef snorkeling in Ras Mohamed', description: 'Two guided snorkeling stops along vibrant coral walls teeming with Red Sea fish.' },
        { step: 3, title: 'White Island sandbank & onboard lunch', description: 'Walk across the gleaming white sandbar and enjoy freshly cooked lunch onboard.' },
      ],
      inclusions: ['Round-trip boat excursion', 'Fresh buffet lunch & soft drinks', 'Snorkeling guide', 'Standard hotel pickup'],
      exclusions: ['National park conservation fee (if payable locally)', 'Optional private transfer or equipment kit'],
      whatToBring: ['Swimwear & towel', 'Reef-safe sunscreen', 'Sunglasses & sun hat', 'Passport copy for marina check'],
    },
    {
      slug: 'pyramids-and-sphinx-tour',
      dest: 'cairo',
      title: 'Pyramids & Sphinx Signature Tour',
      featured: true,
      displayOrder: 2,
      durationLabel: 'Full Day',
      durationHours: 7,
      pricingMode: 'PER_PERSON' as PricingMode,
      ageBands: standardAgeBands(7500, 4500, 0),
      privateGroupPriceMinor: null,
      depositEnabled: true,
      depositPercentBps: 2500,
      instantConfirmPayLater: false,
      cats: ['cultural-tours'],
      addons: ['private-transfer', 'private-egyptologist', 'photo-package'],
      image: '/media/cairo-pyramids-sphinx.webp',
      alt: 'Great Pyramids of Giza and the Great Sphinx glowing in golden sunlight',
      gallery: [
        { url: '/media/cairo-pyramids-sphinx.webp', alt: 'Great Pyramids of Giza and Great Sphinx' },
        { url: '/media/cairo-grand-egyptian-museum.webp', alt: 'Grand Egyptian Museum near Giza Plateau' },
      ],
      shortDescription: 'Discover the Great Pyramids of Khufu, Khafre, and Menkaure alongside the enigmatic Great Sphinx with an English-speaking Egyptologist.',
      meetingPoint: 'Central Cairo or Giza Hotel Lobby',
      itinerary: [
        { step: 1, title: 'Morning hotel pickup', description: 'Air-conditioned transfer to the Giza Plateau before peak crowds.' },
        { step: 2, title: 'Giza Plateau & Panoramic Overlook', description: 'Explore the Great Pyramid complex and capture sweeping desert views.' },
        { step: 3, title: 'Valley Temple & Great Sphinx', description: 'Walk the limestone causeway to the iconic guardian of Giza followed by local lunch.' },
      ],
      inclusions: ['Licensed English-speaking Egyptologist', 'Air-conditioned transport', 'Bottled water', 'Traditional Egyptian lunch'],
      exclusions: ['Interior Great Pyramid burial chamber ticket (optional on-site)', 'Gratuities'],
      whatToBring: ['Comfortable walking shoes', 'Sun hat & sunglasses', 'Light breathable layers', 'Camera'],
    },
    {
      slug: 'orange-bay-hurghada',
      dest: 'hurghada',
      title: 'Orange Bay Island & Reef Cruise',
      featured: true,
      displayOrder: 3,
      durationLabel: 'Full Day',
      durationHours: 8,
      pricingMode: 'PER_PERSON' as PricingMode,
      ageBands: standardAgeBands(5500, 3000, 0),
      privateGroupPriceMinor: null,
      depositEnabled: false,
      depositPercentBps: 0,
      instantConfirmPayLater: true,
      cats: ['beach-tours', 'diving-snorkeling'],
      addons: ['private-transfer', 'snorkel-kit', 'photo-package', 'seafood-lunch-upgrade'],
      image: '/media/hurghada-orange-bay.webp',
      alt: 'Shallow emerald-turquoise beach lagoon and thatched beach cabanas at Orange Bay in Hurghada',
      gallery: [
        { url: '/media/hurghada-orange-bay.webp', alt: 'Orange Bay shallow turquoise beach' },
        { url: '/media/hurghada-giftun-islands.webp', alt: 'Giftun Islands aerial coral lagoons' },
      ],
      shortDescription: 'Sail across Hurghada’s clear waters to Orange Bay’s shallow turquoise lagoon with two coral reef snorkeling stops and freshly prepared lunch.',
      meetingPoint: 'Hurghada Marina (or included central hotel pickup)',
      itinerary: [
        { step: 1, title: 'Marina boarding', description: 'Welcome briefing and sail toward Giftun Marine Reserve.' },
        { step: 2, title: 'Coral garden snorkeling', description: 'Guided reef stop surrounded by tropical Red Sea fish.' },
        { step: 3, title: 'Orange Bay island relaxation', description: 'Two unhurried hours on the calm sandbank plus onboard buffet lunch.' },
      ],
      inclusions: ['Full-day yacht cruise', 'Orange Bay island landing', 'Buffet lunch & soft drinks', 'Guided snorkeling stops'],
      exclusions: ['Optional underwater photography', 'Transfers from outer resort zones unless selected'],
      whatToBring: ['Swimwear & towel', 'Reef-safe sunscreen', 'Sunglasses'],
    },
    {
      slug: 'grand-egyptian-museum-tour',
      dest: 'cairo',
      title: 'Grand Egyptian Museum Guided Discovery',
      featured: false,
      displayOrder: 4,
      durationLabel: 'Half Day',
      durationHours: 5,
      pricingMode: 'PER_PERSON' as PricingMode,
      ageBands: standardAgeBands(6800, 4000, 0),
      privateGroupPriceMinor: null,
      depositEnabled: false,
      depositPercentBps: 0,
      instantConfirmPayLater: false,
      cats: ['cultural-tours'],
      addons: ['private-transfer', 'private-egyptologist'],
      image: '/media/cairo-grand-egyptian-museum.webp',
      alt: 'Grand Egyptian Museum geometric alabaster stone facade and monumental pharaoh statue in Giza',
      gallery: [{ url: '/media/cairo-grand-egyptian-museum.webp', alt: 'Grand Egyptian Museum facade' }],
      shortDescription: 'Walk the Grand Staircase and sunlit galleries of the Grand Egyptian Museum with an expert Egyptologist bringing royal artifacts to life.',
      meetingPoint: 'Cairo / Giza Hotel Pickup',
      itinerary: [
        { step: 1, title: 'Grand Atrium & Ramesses II', description: 'Enter beneath the monumental standing statue of Ramesses II.' },
        { step: 2, title: 'Grand Staircase & Main Galleries', description: 'Curated chronological walk through Old, Middle, and New Kingdom masterpieces.' },
      ],
      inclusions: ['Licensed Egyptologist guide', 'Air-conditioned hotel transfer', 'Bottled water'],
      exclusions: ['Personal purchases', 'Optional private guide upgrade'],
      whatToBring: ['Comfortable shoes', 'Valid ID for museum entry'],
    },
    {
      slug: 'old-cairo-heritage-walk',
      dest: 'cairo',
      title: 'Old Cairo & Khan El Khalili Heritage Walk',
      featured: false,
      displayOrder: 5,
      durationLabel: 'Half Day',
      durationHours: 5,
      pricingMode: 'PER_PERSON' as PricingMode,
      ageBands: standardAgeBands(5200, 3000, 0),
      privateGroupPriceMinor: null,
      depositEnabled: false,
      depositPercentBps: 0,
      instantConfirmPayLater: false,
      cats: ['cultural-tours'],
      addons: ['private-transfer', 'private-egyptologist'],
      image: '/media/cairo-old-cairo-citadel.webp',
      alt: 'Historic Old Cairo lantern-lit archway leading to warm limestone domes and minarets',
      gallery: [{ url: '/media/cairo-old-cairo-citadel.webp', alt: 'Old Cairo historic bazaar and domes' }],
      shortDescription: 'Wander centuries-old limestone domes, Coptic sanctuaries, and the fragrant lantern alleys of Khan El Khalili with a local specialist.',
      meetingPoint: 'Central Cairo Hotel Pickup',
      itinerary: [
        { step: 1, title: 'Historic Coptic Quarter', description: 'Visit the Hanging Church and historic stone courtyards.' },
        { step: 2, title: 'Al-Muizz Street & Khan El Khalili', description: 'Guided architectural walk ending with mint tea in the historic bazaar.' },
      ],
      inclusions: ['Local heritage guide', 'Mint tea stop', 'Round-trip hotel transport'],
      exclusions: ['Shopping and gratuities'],
      whatToBring: ['Modest comfortable attire', 'Walking shoes'],
    },
    {
      slug: 'cairo-nile-evening-cruise',
      dest: 'cairo',
      title: 'Private Nile Sunset Felucca & Dinner',
      featured: false,
      displayOrder: 6,
      durationLabel: 'Evening (3 hrs)',
      durationHours: 3,
      pricingMode: 'PRIVATE_GROUP' as PricingMode,
      ageBands: standardAgeBands(0, 0, 0),
      privateGroupPriceMinor: 16500,
      depositEnabled: true,
      depositPercentBps: 3000,
      instantConfirmPayLater: false,
      cats: ['nile-cruises', 'cultural-tours'],
      addons: ['private-transfer', 'photo-package'],
      image: '/media/cairo-nile-dinner-cruise.webp',
      alt: 'Traditional white-sailed felucca gliding across the Nile River in Cairo at sunset',
      gallery: [{ url: '/media/cairo-nile-dinner-cruise.webp', alt: 'Cairo Nile golden hour felucca' }],
      shortDescription: 'Exclusive private traditional felucca charter along Cairo’s shimmering Nile at sunset with freshly prepared Egyptian mezze for up to 6 guests.',
      meetingPoint: 'Maadi / Garden City Nile Pier',
      itinerary: [
        { step: 1, title: 'Private pier boarding', description: 'Step aboard your private wooden felucca as afternoon heat softens.' },
        { step: 2, title: 'Golden-hour Nile sail & dinner', description: 'Drift past palm-lined banks with hot mezze, grilled specialties, and hibiscus tea.' },
      ],
      inclusions: ['Private felucca & captain (up to 6 guests)', 'Egyptian mezze & dinner', 'Soft drinks & tea'],
      exclusions: ['Optional private hotel transfer'],
      whatToBring: ['Light evening wrap in winter months', 'Camera'],
    },
    {
      slug: 'sharm-scuba-diving',
      dest: 'sharm-el-sheikh',
      title: 'Sharm El Sheikh Coral Reef Scuba Diving',
      featured: false,
      displayOrder: 7,
      durationLabel: 'Half Day',
      durationHours: 5,
      pricingMode: 'PER_PERSON' as PricingMode,
      ageBands: [
        { code: 'ADULT', label: 'Diver (12+ yrs)', minAge: 12, maxAge: null, priceMinor: 8500, consumesSeat: true },
        { code: 'CHILD', label: 'Junior Snorkeler (8–11 yrs)', minAge: 8, maxAge: 11, priceMinor: 4500, consumesSeat: true },
      ],
      privateGroupPriceMinor: null,
      depositEnabled: true,
      depositPercentBps: 2500,
      instantConfirmPayLater: false,
      cats: ['diving-snorkeling'],
      addons: ['private-transfer', 'photo-package'],
      image: '/media/sharm-scuba-coral-reef.webp',
      alt: 'Scuba diver swimming over colorful Red Sea coral reef with bright orange reef fish',
      gallery: [{ url: '/media/sharm-scuba-coral-reef.webp', alt: 'Sharm El Sheikh underwater coral reef diving' }],
      shortDescription: 'Two guided Red Sea reef dives tailored to beginners (Discover Scuba) or certified divers with PADI-certified instructors in Sharm El Sheikh.',
      meetingPoint: 'Naama Bay Dive Center Jetty',
      itinerary: [
        { step: 1, title: 'Equipment fitting & safety briefing', description: 'Full gear check and buoyancy orientation with your instructor.' },
        { step: 2, title: 'Two reef dives', description: 'Explore sunlit coral gardens alive with anthias, parrotfish, and sea fans.' },
      ],
      inclusions: ['Certified dive instructor', 'Tanks, weights & full scuba kit', 'Boat transfers & drinking water'],
      exclusions: ['Dive computer rental if required separately'],
      whatToBring: ['Swimwear & towel', 'Certification card (if certified)', 'Note: allow 18h before flying'],
    },
    {
      slug: 'sharm-desert-safari',
      dest: 'sharm-el-sheikh',
      title: 'Sinai Desert 4x4 Safari & Bedouin Sunset',
      featured: false,
      displayOrder: 8,
      durationLabel: 'Half Day',
      durationHours: 5,
      pricingMode: 'PER_PERSON' as PricingMode,
      ageBands: standardAgeBands(5000, 3000, 0),
      privateGroupPriceMinor: null,
      depositEnabled: false,
      depositPercentBps: 0,
      instantConfirmPayLater: false,
      cats: ['safari-tours'],
      addons: ['private-transfer', 'photo-package'],
      image: '/media/sharm-sinai-desert-safari.webp',
      alt: '4x4 safari vehicle crossing golden Sinai desert sands beneath rugged desert mountains',
      gallery: [{ url: '/media/sharm-sinai-desert-safari.webp', alt: 'Sinai 4x4 desert safari' }],
      shortDescription: 'Venture deep into Sinai’s ochre canyons by 4x4, watch sunset over desert ridges, and enjoy traditional Bedouin tea and stargazing dinner.',
      meetingPoint: 'Sharm El Sheikh Resort Lobby',
      itinerary: [
        { step: 1, title: '4x4 Canyon Drive', description: 'Traverse golden wadis and dramatic sandstone valleys.' },
        { step: 2, title: 'Sunset ridge & Bedouin camp', description: 'Warm Bedouin tea, freshly baked flatbread, barbecue dinner, and stargazing.' },
      ],
      inclusions: ['4x4 vehicle & desert driver', 'Bedouin tea & barbecue dinner', 'Round-trip hotel pickup'],
      exclusions: ['Optional scarf / goggles'],
      whatToBring: ['Closed-toe shoes', 'Sunglasses', 'Light jacket after sunset'],
    },
    {
      slug: 'sharm-private-yacht-charter',
      dest: 'sharm-el-sheikh',
      title: 'Private Sharm Luxury Yacht Charter',
      featured: false,
      displayOrder: 9,
      durationLabel: 'Full Day',
      durationHours: 8,
      pricingMode: 'PRIVATE_GROUP' as PricingMode,
      ageBands: standardAgeBands(0, 0, 0),
      privateGroupPriceMinor: 49000,
      depositEnabled: true,
      depositPercentBps: 3000,
      instantConfirmPayLater: false,
      cats: ['adventure-tours', 'beach-tours'],
      addons: ['private-transfer', 'seafood-lunch-upgrade', 'photo-package'],
      image: '/media/sharm-luxury-yacht-cruise.webp',
      alt: 'White private motor yacht anchored in clear turquoise Red Sea waters near Sinai mountains',
      gallery: [{ url: '/media/sharm-luxury-yacht-cruise.webp', alt: 'Private Sharm luxury motor yacht' }],
      shortDescription: 'Charter a sleek private motor yacht with captain and crew for up to 10 guests to explore Tiran Island or Ras Mohamed at your own rhythm.',
      meetingPoint: 'Sharm El Sheikh Marina',
      itinerary: [
        { step: 1, title: 'Private embarkation', description: 'Choose your preferred route with the captain — Tiran lagoons or Ras Mohamed reefs.' },
        { step: 2, title: 'Private reef stops & chef lunch', description: 'Swim, snorkel, and sunbathe on the upper deck with freshly prepared lunch.' },
      ],
      inclusions: ['Exclusive yacht, captain & crew (up to 10 guests)', 'Fresh lunch & soft beverages', 'Snorkeling masks & life vests'],
      exclusions: ['Optional seafood grill upgrade', 'Marine park fees'],
      whatToBring: ['Swimwear & towels', 'Sun protection', 'Passport copies'],
    },
    {
      slug: 'abu-dabbab-snorkeling',
      dest: 'marsa-alam',
      title: 'Abu Dabbab Sea Turtles & Coral Bay',
      featured: false,
      displayOrder: 10,
      durationLabel: 'Full Day',
      durationHours: 7,
      pricingMode: 'PER_PERSON' as PricingMode,
      ageBands: standardAgeBands(5800, 3200, 0),
      privateGroupPriceMinor: null,
      depositEnabled: false,
      depositPercentBps: 0,
      instantConfirmPayLater: false,
      cats: ['diving-snorkeling', 'beach-tours'],
      addons: ['private-transfer', 'snorkel-kit', 'photo-package'],
      image: '/media/marsa-abu-dabbab-turtle.webp',
      alt: 'Green sea turtle gliding above sunlit coral reefs in crystal-clear Marsa Alam bay',
      gallery: [{ url: '/media/marsa-abu-dabbab-turtle.webp', alt: 'Abu Dabbab green sea turtle' }],
      shortDescription: 'Snorkel straight from the sandy shoreline of Abu Dabbab Bay, famous for resident green sea turtles, guitarfish, and sheltered dual house reefs.',
      meetingPoint: 'Marsa Alam / Port Ghalib Resort Pickup',
      itinerary: [
        { step: 1, title: 'Arrival at Abu Dabbab sandy bay', description: 'Easy walk-in beach entry suited to beginners and experienced snorkelers.' },
        { step: 2, title: 'Guided reef & seagrass snorkeling', description: 'Observe grazing green sea turtles respectfully alongside healthy coral walls.' },
      ],
      inclusions: ['Beach entrance & sunbed', 'Guided snorkeling sessions', 'Lunch & bottled water', 'Hotel transfers'],
      exclusions: ['Optional equipment kit if not owned'],
      whatToBring: ['Swimwear & towel', 'Reef-safe sunscreen', 'Underwater camera'],
    },
    {
      slug: 'sataya-dolphin-reef',
      dest: 'marsa-alam',
      title: 'Sataya Dolphin Reef Full-Day Excursion',
      featured: false,
      displayOrder: 11,
      durationLabel: 'Full Day',
      durationHours: 9,
      pricingMode: 'PER_PERSON' as PricingMode,
      ageBands: standardAgeBands(9200, 5200, 0),
      privateGroupPriceMinor: null,
      depositEnabled: true,
      depositPercentBps: 2500,
      instantConfirmPayLater: false,
      cats: ['diving-snorkeling', 'adventure-tours'],
      addons: ['private-transfer', 'snorkel-kit', 'photo-package'],
      image: '/media/marsa-sataya-dolphin-reef.webp',
      alt: 'Pod of wild spinner dolphins swimming through crystal-clear turquoise waters at Sataya Dolphin Reef',
      gallery: [{ url: '/media/marsa-sataya-dolphin-reef.webp', alt: 'Spinner dolphins at Sataya Reef' }],
      shortDescription: 'Cruise to the horseshoe-shaped lagoon of Sataya Reef in southern Marsa Alam to snorkel responsibly near resident pods of wild spinner dolphins.',
      meetingPoint: 'Hamata Marina (hotel transfers arranged)',
      itinerary: [
        { step: 1, title: 'Sail from Hamata Marina', description: 'Two-hour turquoise open-sea cruise to Sataya Dolphin House.' },
        { step: 2, title: 'Lagoon dolphin & outer reef snorkeling', description: 'Guided small-group entries respecting wildlife distance guidelines plus onboard lunch.' },
      ],
      inclusions: ['Spacious dive-boat excursion', 'Two guided lagoon & reef snorkels', 'Onboard lunch & drinks', 'Marine guide'],
      exclusions: ['National park environmental fee', 'Optional private transfer'],
      whatToBring: ['Swimwear & towel', 'Windbreaker for deck breeze', 'Reef-safe sunblock'],
    },
    {
      slug: 'hamata-islands-excursion',
      dest: 'marsa-alam',
      title: 'Hamata Islands & Virgin Lagoons',
      featured: false,
      displayOrder: 12,
      durationLabel: 'Full Day',
      durationHours: 8,
      pricingMode: 'PER_PERSON' as PricingMode,
      ageBands: standardAgeBands(7800, 4400, 0),
      privateGroupPriceMinor: null,
      depositEnabled: false,
      depositPercentBps: 0,
      instantConfirmPayLater: false,
      cats: ['beach-tours', 'diving-snorkeling'],
      addons: ['private-transfer', 'snorkel-kit', 'photo-package'],
      image: '/media/marsa-hamata-islands.webp',
      alt: 'Pristine Hamata Islands turquoise sandbars and coastal mangrove lagoons in Marsa Alam',
      gallery: [{ url: '/media/marsa-hamata-islands.webp', alt: 'Hamata Islands lagoons' }],
      shortDescription: 'Discover the untouched triple-island archipelago of Wadi El Gemal National Park with powdery sandbars, coastal mangroves, and vibrant virgin reefs.',
      meetingPoint: 'Hamata Marina (transfers available)',
      itinerary: [
        { step: 1, title: 'Island-hopping cruise', description: 'Anchor off three pristine uninhabited islands inside Wadi El Gemal Marine Park.' },
        { step: 2, title: 'Sandbar walk & coral garden snorkel', description: 'Stroll calm turquoise shallows and snorkel untouched coral pinnacles.' },
      ],
      inclusions: ['Full-day boat trip', 'Lunch & soft drinks', 'Snorkeling guide', 'Standard resort transfer'],
      exclusions: ['Park conservation fee'],
      whatToBring: ['Sun hat & reef-safe sunscreen', 'Swimwear & towel'],
    },
    {
      slug: 'giftun-islands-cruise',
      dest: 'hurghada',
      title: 'Giftun Islands Coral & Sandbank Cruise',
      featured: false,
      displayOrder: 13,
      durationLabel: 'Full Day',
      durationHours: 8,
      pricingMode: 'PER_PERSON' as PricingMode,
      ageBands: standardAgeBands(5200, 2900, 0),
      privateGroupPriceMinor: null,
      depositEnabled: false,
      depositPercentBps: 0,
      instantConfirmPayLater: false,
      cats: ['beach-tours', 'adventure-tours'],
      addons: ['private-transfer', 'snorkel-kit', 'seafood-lunch-upgrade'],
      image: '/media/hurghada-giftun-islands.webp',
      alt: 'Aerial view of Giftun Islands turquoise coral reefs, white curved sandbars, and excursion yachts',
      gallery: [{ url: '/media/hurghada-giftun-islands.webp', alt: 'Giftun Islands sandbars and reefs' }],
      shortDescription: 'Spend a sunlit day sailing around the Giftun Islands National Park with crystalline reef stops, sandy cove lounging, and fresh buffet lunch.',
      meetingPoint: 'Hurghada Marina',
      itinerary: [
        { step: 1, title: 'Set sail across Hurghada Bay', description: 'Relax on the sundeck as you approach Giftun’s turquoise shallows.' },
        { step: 2, title: 'Two coral reef stops & island beach', description: 'Guided snorkeling and unhurried beach time on soft white sands.' },
      ],
      inclusions: ['Full-day excursion boat', 'Lunch & soft beverages', 'Snorkeling guides'],
      exclusions: ['Optional private transfer'],
      whatToBring: ['Swimwear & towel', 'Sunscreen'],
    },
    {
      slug: 'hurghada-desert-safari',
      dest: 'hurghada',
      title: 'Eastern Desert 4x4 & Dune Safari',
      featured: false,
      displayOrder: 14,
      durationLabel: 'Half Day',
      durationHours: 5,
      pricingMode: 'PER_PERSON' as PricingMode,
      ageBands: standardAgeBands(4800, 2800, 0),
      privateGroupPriceMinor: null,
      depositEnabled: false,
      depositPercentBps: 0,
      instantConfirmPayLater: false,
      cats: ['safari-tours'],
      addons: ['private-transfer', 'photo-package'],
      image: '/media/hurghada-desert-quad-safari.webp',
      alt: '4x4 safari vehicle crossing golden Eastern Desert dunes with rugged peaks near Hurghada',
      gallery: [{ url: '/media/hurghada-desert-quad-safari.webp', alt: 'Hurghada Eastern Desert 4x4 safari' }],
      shortDescription: 'Cross sweeping golden dunes and desert valleys west of Hurghada by 4x4, visit a desert village for tea, and watch sunset illuminate the peaks.',
      meetingPoint: 'Hurghada Hotel Pickup',
      itinerary: [
        { step: 1, title: '4x4 Desert Crossing', description: 'Thrilling off-road drive across Red Sea coastal mountain plains.' },
        { step: 2, title: 'Desert tea & sunset viewpoint', description: 'Traditional hospitality, sunset vistas, and open-air dinner.' },
      ],
      inclusions: ['4x4 transport & experienced desert guide', 'Bedouin tea & dinner', 'Hotel pickup'],
      exclusions: ['Personal scarves or optional quad upgrade'],
      whatToBring: ['Closed shoes', 'Sunglasses', 'Light jacket'],
    },
    {
      slug: 'luxor-karnak-valley-of-kings',
      dest: 'luxor-aswan',
      title: 'Karnak Temples & Valley of the Kings',
      featured: false,
      displayOrder: 15,
      durationLabel: 'Full Day',
      durationHours: 9,
      pricingMode: 'PER_PERSON' as PricingMode,
      ageBands: standardAgeBands(9800, 5800, 0),
      privateGroupPriceMinor: null,
      depositEnabled: true,
      depositPercentBps: 2500,
      instantConfirmPayLater: false,
      cats: ['cultural-tours'],
      addons: ['private-transfer', 'private-egyptologist'],
      image: '/media/luxor-karnak-temples.webp',
      alt: 'Monumental ancient sandstone columns and pharaoh statue at Karnak Temple in Luxor',
      gallery: [
        { url: '/media/luxor-karnak-temples.webp', alt: 'Karnak Temple Hypostyle Hall in Luxor' },
        { url: '/media/luxor-valley-of-the-kings.webp', alt: 'Vibrant hieroglyphic corridor inside Valley of the Kings royal tomb' },
      ],
      shortDescription: 'Journey across ancient Thebes from the soaring columns of Karnak Temple on the East Bank to the painted royal tombs of the Valley of the Kings.',
      meetingPoint: 'Luxor Hotel or Nile Cruise Pier',
      itinerary: [
        { step: 1, title: 'West Bank & Valley of the Kings', description: 'Enter three richly painted royal tombs alongside your licensed Egyptologist.' },
        { step: 2, title: 'Colossi of Memnon & riverside lunch', description: 'Pause at the monumental statues and enjoy freshly prepared Upper Egyptian lunch.' },
        { step: 3, title: 'Karnak Temple Complex', description: 'Walk the Avenue of Sphinxes and the Great Hypostyle Hall in warm afternoon light.' },
      ],
      inclusions: ['Licensed Egyptologist guide', 'Air-conditioned vehicle', 'Lunch & bottled water'],
      exclusions: ['Optional extra tomb tickets (e.g. Tutankhamun / Seti I)'],
      whatToBring: ['Breathable sun protection', 'Comfortable walking shoes', 'Camera'],
    },
    {
      slug: 'aswan-philae-felucca',
      dest: 'luxor-aswan',
      title: 'Philae Temple & Sunset Nile Felucca',
      featured: false,
      displayOrder: 16,
      durationLabel: 'Full Day',
      durationHours: 7,
      pricingMode: 'PER_PERSON' as PricingMode,
      ageBands: standardAgeBands(8400, 4800, 0),
      privateGroupPriceMinor: null,
      depositEnabled: false,
      depositPercentBps: 0,
      instantConfirmPayLater: false,
      cats: ['cultural-tours', 'nile-cruises'],
      addons: ['private-transfer', 'private-egyptologist'],
      image: '/media/aswan-philae-temple.webp',
      alt: 'Philae Temple on Agilkia Island rising from calm sapphire Nile waters framed by palm trees in Aswan',
      gallery: [
        { url: '/media/aswan-philae-temple.webp', alt: 'Philae Temple island in Aswan' },
        { url: '/media/story-nile-felucca.webp', alt: 'Traditional wooden felucca sailing the Nile at sunset' },
      ],
      shortDescription: 'Cross by motorboat to the island sanctuary of Isis at Philae Temple, then unwind aboard a traditional white-sailed felucca around Elephantine Island.',
      meetingPoint: 'Aswan Corniche Hotel / Pier',
      itinerary: [
        { step: 1, title: 'Boat crossing to Philae Island', description: 'Guided exploration of the Ptolemaic colonnades dedicated to Goddess Isis.' },
        { step: 2, title: 'Sunset Nile Felucca Sail', description: 'Glide past smooth granite boulders and Nubian riverbanks at golden hour.' },
      ],
      inclusions: ['Motorboat transfer to Philae Island', 'Licensed Egyptologist guide', 'Sunset felucca sail', 'Hotel pickup'],
      exclusions: ['Personal purchases and tips'],
      whatToBring: ['Sunscreen & hat', 'Camera', 'Light scarf'],
    },
  ];

  const today = todayInCairo();
  const fromDate = today.add({ days: 1 }).toString();
  const toDate = today.add({ days: 45 }).toString();
  const blackoutSample = today.add({ days: 7 }).toString();
  const soldOutSample = today.add({ days: 4 }).toString();
  const lowCapSample = today.add({ days: 5 }).toString();

  const toursMap = new Map<string, { id: string; firstDepartureId: string }>();

  for (const spec of tourSpecs) {
    const destId = destinations.get(spec.dest)!;
    const isPrivate = spec.pricingMode === 'PRIVATE_GROUP';

    const tour = await client.tour.upsert({
      where: { slug: spec.slug },
      update: {},
      create: {
        slug: spec.slug,
        status: 'PUBLISHED',
        title: spec.title,
        destinationId: destId,
        shortDescription: spec.shortDescription,
        descriptionHtml: opts.demoMode
          ? `<p>${spec.shortDescription}</p><p>Operated in local Egypt time (Africa/Cairo) with clear pickup coordination and transparent pricing. <em>Demo itinerary and pricing require business-owner confirmation prior to live launch.</em></p>`
          : `<p>${spec.shortDescription}</p><p>Operated in local Egypt time (Africa/Cairo) with clear hotel pickup coordination and upfront pricing.</p>`,
        highlightsJson: spec.itinerary.map((i) => i.title),
        durationLabel: spec.durationLabel,
        durationHours: spec.durationHours,
        guideLanguagesJson: ['English'],
        meetingPoint: spec.meetingPoint,
        minAge: spec.slug === 'sharm-scuba-diving' ? 8 : 0,
        accessibilityInfo: 'Contact our reservations team prior to booking for mobility or dietary accommodations.',
        itineraryJson: spec.itinerary,
        inclusionsJson: spec.inclusions,
        exclusionsJson: spec.exclusions,
        whatToBringJson: spec.whatToBring,
        faqJson: [
          { question: 'How do I receive pickup timing?', answer: 'Exact hotel pickup timing in Africa/Cairo local time is sent in your confirmation voucher once availability is approved.' },
          { question: 'Can I reschedule if my plans change?', answer: 'Yes, rescheduling is available subject to departure availability and the tour cancellation window.' },
        ],
        pricingMode: spec.pricingMode,
        currency: 'USD',
        pricingVersion: 1,
        privateGroupPriceMinor: spec.privateGroupPriceMinor,
        minAdults: 1,
        minPartySize: 1,
        maxPartySize: isPrivate ? 10 : 16,
        ageBandsJson: spec.ageBands as unknown as Prisma.InputJsonValue,
        taxIncluded: true,
        taxRateBps: 0,
        serviceFeeIncluded: true,
        serviceFeeBps: 0,
        depositEnabled: spec.depositEnabled,
        depositPercentBps: spec.depositPercentBps,
        instantConfirmPayLater: spec.instantConfirmPayLater,
        defaultCapacity: isPrivate ? 10 : 16,
        defaultCutoffHours: 12,
        policyId: isPrivate ? charterPolicy.id : standardPolicy.id,
        featured: spec.featured,
        displayOrder: spec.displayOrder,
        primaryImageUrl: spec.image,
        primaryImageAlt: spec.alt,
        galleryJson: spec.gallery,
        seoTitle: `${spec.title} | Sharm Pharaoh Travel`,
        seoDescription: spec.shortDescription,
      },
    });

    for (const cSlug of spec.cats) {
      const catId = categories.get(cSlug);
      if (catId) {
        await client.tourCategory.upsert({
          where: { tourId_categoryId: { tourId: tour.id, categoryId: catId } },
          update: {},
          create: { tourId: tour.id, categoryId: catId },
        });
      }
    }

    for (const aCode of spec.addons) {
      const addonId = addons.get(aCode);
      if (addonId) {
        await client.tourAddon.upsert({
          where: { tourId_addonId: { tourId: tour.id, addonId } },
          update: {},
          create: { tourId: tour.id, addonId },
        });
      }
    }

    for (const pId of pickupsByDest.get(spec.dest) ?? []) {
      await client.tourPickupZone.upsert({
        where: { tourId_pickupZoneId: { tourId: tour.id, pickupZoneId: pId } },
        update: {},
        create: { tourId: tour.id, pickupZoneId: pId },
      });
    }

    // Create recurring schedule + blackout date
    const existingSched = await client.recurringSchedule.findFirst({ where: { tourId: tour.id } });
    if (!existingSched) {
      await client.recurringSchedule.create({
        data: {
          tourId: tour.id,
          weekdaysJson: [1, 2, 3, 4, 5, 6, 7],
          startTime: spec.durationLabel.includes('Evening') ? '16:30' : '08:00',
          capacity: isPrivate ? 10 : 16,
          cutoffHours: 12,
          activeFromDate: fromDate,
          activeToDate: toDate,
        },
      });
    }

    if (opts.demoMode) {
      await client.blackoutDate.upsert({
        where: { tourId_date: { tourId: tour.id, date: blackoutSample } },
        update: {},
        create: {
          tourId: tour.id,
          date: blackoutSample,
          reason: 'Scheduled vessel/route maintenance (demo blackout)',
        },
      });
    }

    const startTime = spec.durationLabel.includes('Evening') ? '16:30' : '08:00';
    const dates = generateRecurringCairoDates({
      fromDate,
      toDate,
      weekdays: [1, 2, 3, 4, 5, 6, 7],
      blackoutDates: opts.demoMode ? [blackoutSample] : [],
    });

    let firstDepartureId = '';
    for (const dStr of dates) {
      const { utcDate } = cairoLocalToUtc(dStr, startTime);
      const isSoldOut = opts.demoMode && spec.slug === 'ras-mohamed-white-island' && dStr === soldOutSample;
      const isLowCap = opts.demoMode && spec.slug === 'ras-mohamed-white-island' && dStr === lowCapSample;
      const dep = await client.departure.upsert({
        where: { tourId_departureDate_startTime: { tourId: tour.id, departureDate: dStr, startTime } },
        update: {},
        create: {
          tourId: tour.id,
          departureDate: dStr,
          startTime,
          startUtc: utcDate,
          timezone: 'Africa/Cairo',
          capacity: isLowCap ? 5 : isPrivate ? 10 : 16,
          bookedSeats: isSoldOut ? 16 : 0,
          heldSeats: 0,
          status: 'OPEN',
          cutoffHours: 12,
          pickupTimeNote: 'Hotel pickup window 30–45 minutes prior to departure (Cairo time)',
        },
      });
      if (!firstDepartureId && !isSoldOut) firstDepartureId = dep.id;
    }

    toursMap.set(spec.slug, { id: tour.id, firstDepartureId });
  }


  // CMS Pages for Home, Tours, Contact, and all 5 Destinations
  await upsertPublishedPage(client, {
    slug: 'home',
    kind: 'HOME',
    title: 'Home',
    content: {
      schemaVersion: CMS_SCHEMA_VERSION,
      seo: {
        title: 'Sharm Pharaoh Travel | Egypt Excursions & Red Sea Tours',
        description: 'From the wonders of the Red Sea to the timeless beauty of the Pharaohs. Discover curated tours across Cairo, Sharm El Sheikh, Marsa Alam, Hurghada, and Luxor & Aswan.',
        noIndex: false,
      },
      blocks: [
        {
          id: 'home-hero',
          type: 'Hero',
          label: 'Hero',
          hidden: false,
          locked: false,
          style: { backgroundToken: 'petrol', textAlign: 'left', containerWidth: 'full', paddingTopPx: 88, paddingBottomPx: 112, overlayOpacity: 42, hideOnMobile: false, hideOnTablet: false, hideOnDesktop: false, fontScale: 'editorial' },
          props: {
            headlineAccent: 'Egypt.',
            headline: 'Every journey tells a story.',
            subtitle: 'From the wonders of the Red Sea to the timeless beauty of the Pharaohs.',
            imageUrl: '/media/hero-red-sea-yacht.webp',
            imageAlt: 'White luxury yacht cruising crystal-clear turquoise Red Sea coral waters with Sinai mountains behind',
            focalPoint: { x: 35, y: 50 },
            primaryCtaLabel: 'Explore Tours',
            primaryCtaHref: '/tours',
            secondaryCtaLabel: 'Discover Destinations',
            secondaryCtaHref: '#destinations',
            compact: false,
          },
        },
        {
          id: 'home-search',
          type: 'SearchBar',
          label: 'Search Bar',
          hidden: false,
          locked: true,
          style: { backgroundToken: 'ivory', textAlign: 'left', containerWidth: 'default', paddingTopPx: 0, paddingBottomPx: 24, overlayOpacity: 0, hideOnMobile: false, hideOnTablet: false, hideOnDesktop: false, fontScale: 'default' },
          props: {
            destinationLabel: 'Destination',
            tourTypeLabel: 'Tour Type',
            dateLabel: 'Date',
            submitLabel: 'Find Your Trip',
            floatingOverlap: true,
          },
        },
        {
          id: 'home-destinations',
          type: 'DestinationGrid',
          label: 'Destinations',
          hidden: false,
          locked: false,
          style: { backgroundToken: 'ivory', textAlign: 'center', containerWidth: 'default', paddingTopPx: 40, paddingBottomPx: 48, overlayOpacity: 0, hideOnMobile: false, hideOnTablet: false, hideOnDesktop: false, fontScale: 'default' },
          props: {
            heading: 'Where will you go next?',
            columns: 5,
            orderSlugs: ['luxor-aswan', 'hurghada', 'marsa-alam', 'sharm-el-sheikh', 'cairo'],
          },
        },
        {
          id: 'home-featured-tours',
          type: 'TourGrid',
          label: 'Featured Tours',
          hidden: false,
          locked: false,
          style: { backgroundToken: 'ivory', textAlign: 'center', containerWidth: 'default', paddingTopPx: 24, paddingBottomPx: 56, overlayOpacity: 0, hideOnMobile: false, hideOnTablet: false, hideOnDesktop: false, fontScale: 'default' },
          props: {
            heading: 'Experiences worth travelling for',
            mode: 'FEATURED',
            limit: 3,
            columns: 3,
            showPrice: true,
          },
        },
        {
          id: 'home-story-cta',
          type: 'CallToAction',
          label: 'Story Banner',
          hidden: false,
          locked: false,
          style: { backgroundToken: 'ivory', textAlign: 'left', containerWidth: 'default', paddingTopPx: 16, paddingBottomPx: 64, overlayOpacity: 0, hideOnMobile: false, hideOnTablet: false, hideOnDesktop: false, fontScale: 'default' },
          props: {
            heading: 'Your journey. Your way.',
            body: 'Tailor your perfect Egypt experience, from Red Sea adventures to ancient wonders across the country.',
            imageUrl: '/media/story-nile-felucca.webp',
            imageAlt: 'Traditional wooden felucca sailing along the golden sunlit Nile River near ancient sandstone temples',
            ctaLabel: 'Plan Your Trip',
            ctaHref: '/contact',
          },
        },
      ],
    },
  });

  await upsertPublishedPage(client, {
    slug: 'tours',
    kind: 'TOURS',
    title: 'Tours',
    content: {
      schemaVersion: CMS_SCHEMA_VERSION,
      seo: {
        title: 'Explore Egypt Tours & Excursions | Sharm Pharaoh Travel',
        description: 'Filter live Egypt excursions by destination, activity type, available departure date, duration, and price.',
        noIndex: false,
      },
      blocks: [
        {
          id: 'tours-hero',
          type: 'Hero',
          label: 'Tours Hero',
          hidden: false,
          locked: false,
          style: { backgroundToken: 'petrol', textAlign: 'left', containerWidth: 'full', paddingTopPx: 64, paddingBottomPx: 64, overlayOpacity: 48, hideOnMobile: false, hideOnTablet: false, hideOnDesktop: false, fontScale: 'default' },
          props: {
            headline: 'Your next adventure starts here',
            subtitle: 'Discover Egypt’s top Red Sea excursions and heritage experiences with real departure availability.',
            imageUrl: '/media/marsa-abu-dabbab-turtle.webp',
            imageAlt: 'Green sea turtle swimming above vibrant Red Sea coral reefs',
            focalPoint: { x: 30, y: 50 },
            compact: true,
          },
        },
      ],
    },
  });

  await upsertPublishedPage(client, {
    slug: 'contact',
    kind: 'CONTACT',
    title: 'Contact',
    content: {
      schemaVersion: CMS_SCHEMA_VERSION,
      seo: {
        title: 'Contact & Custom Trip Planning | Sharm Pharaoh Travel',
        description: 'Get in touch with our travel specialists to plan your Red Sea excursion or tailored Egypt itinerary.',
        noIndex: false,
      },
      blocks: [
        {
          id: 'contact-hero',
          type: 'Hero',
          label: 'Contact Hero',
          hidden: false,
          locked: false,
          style: { backgroundToken: 'petrol', textAlign: 'left', containerWidth: 'full', paddingTopPx: 64, paddingBottomPx: 64, overlayOpacity: 45, hideOnMobile: false, hideOnTablet: false, hideOnDesktop: false, fontScale: 'default' },
          props: {
            headline: "Let's plan your journey",
            subtitle: "Get in touch and we'll create your perfect trip across Egypt.",
            imageUrl: '/media/contact-hero-sinai.webp',
            imageAlt: 'Sunlit Red Sea beach with palm umbrellas and dramatic Sinai desert mountains',
            focalPoint: { x: 35, y: 50 },
            compact: true,
          },
        },
        {
          id: 'contact-form',
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
        },
        {
          id: 'contact-faq',
          type: 'FAQ',
          label: 'Contact FAQ',
          hidden: false,
          locked: false,
          style: { backgroundToken: 'ivory', textAlign: 'left', containerWidth: 'default', paddingTopPx: 16, paddingBottomPx: 64, overlayOpacity: 0, hideOnMobile: false, hideOnTablet: false, hideOnDesktop: false, fontScale: 'default' },
          props: {
            heading: 'Frequently Asked Questions',
            subheading: 'Quick answers to help you plan with confidence.',
            bannerImageUrl: '/media/story-nile-felucca.webp',
            bannerImageAlt: 'Golden sunset over Egyptian waters',
            items: [
              { question: 'How can I book a tour?', answer: 'Browse any tour, pick an available date and party size, review the full itemized quote, and submit your booking request directly online — no account required.' },
              { question: 'Can you customize a travel itinerary?', answer: 'Yes. Share your dates, destinations, and preferred pace using the inquiry form above and our advisors will design a private itinerary.' },
              { question: 'What should I pack for my trip to Egypt?', answer: 'Bring breathable clothing, reef-safe sunscreen, sunglasses, swimwear for Red Sea boat trips, and comfortable walking shoes for temples and pyramids.' },
            ],
          },
        },
      ],
    },
  });

  // Destination CMS pages (independently editable in Live Editor!)
  const destStoryMeta: Record<string, { heading: string; body: string; img: string; alt: string }> = {
    cairo: {
      heading: 'A story around every corner',
      body: 'From ancient wonders on the Giza Plateau to lantern-lit historic bazaars, Cairo brings five millennia of history to life.',
      img: '/media/cairo-old-cairo-citadel.webp',
      alt: 'Historic Old Cairo bazaar archway lit with warm traditional lanterns',
    },
    'sharm-el-sheikh': {
      heading: 'A whole world beneath the waves',
      body: 'Discover vibrant coral walls, protected marine parks, and unforgettable Red Sea excursions in Sharm El Sheikh.',
      img: '/media/sharm-scuba-coral-reef.webp',
      alt: 'Vibrant Red Sea coral reef life in Sharm El Sheikh',
    },
    'marsa-alam': {
      heading: "Dive into Marsa Alam's pristine beauty.",
      body: 'Swim alongside sea turtles, wild spinner dolphins, and untouched southern Red Sea lagoons.',
      img: '/media/marsa-hamata-islands.webp',
      alt: 'Untouched turquoise coastline of Hamata Islands in Marsa Alam',
    },
    hurghada: {
      heading: 'Sun, sea and adventure in Hurghada.',
      body: 'Island sandbanks, coral gardens, and desert dunes come together along Hurghada’s sunlit coast.',
      img: '/media/hurghada-giftun-islands.webp',
      alt: 'Giftun Islands turquoise shallow sandbank in Hurghada',
    },
    'luxor-aswan': {
      heading: 'Icons, temples and the timeless Nile.',
      body: 'Step into royal tombs and drift beneath white felucca sails across Upper Egypt’s living monuments.',
      img: '/media/story-nile-felucca.webp',
      alt: 'Sunset felucca sailing along the Nile River near ancient temples',
    },
  };

  for (const d of destinationSpecs) {
    const destId = destinations.get(d.slug)!;
    const story = destStoryMeta[d.slug];
    await upsertPublishedPage(client, {
      slug: `destinations/${d.slug}`,
      kind: 'DESTINATION',
      title: d.name,
      destinationId: destId,
      content: {
        schemaVersion: CMS_SCHEMA_VERSION,
        seo: {
          title: `${d.name} Tours & Excursions | Sharm Pharaoh Travel`,
          description: d.heroSubtitle,
          noIndex: false,
        },
        blocks: [
          {
            id: `dest-hero-${d.slug}`,
            type: 'Hero',
            label: `${d.name} Hero`,
            hidden: false,
            locked: false,
            style: { backgroundToken: 'petrol', textAlign: 'left', containerWidth: 'full', paddingTopPx: 72, paddingBottomPx: 72, overlayOpacity: 44, hideOnMobile: false, hideOnTablet: false, hideOnDesktop: false, fontScale: 'editorial' },
            props: {
              headline: d.name,
              subtitle: d.tagline,
              imageUrl: d.heroImageUrl,
              imageAlt: d.heroImageAlt,
              focalPoint: { x: 45, y: 45 },
              primaryCtaLabel: 'View Tours',
              primaryCtaHref: `#dest-tours-${d.slug}`,
              secondaryCtaLabel: 'Explore Highlights',
              secondaryCtaHref: '#highlights',
              compact: true,
            },
          },
          {
            id: `dest-tours-${d.slug}`,
            type: 'TourGrid',
            label: `${d.name} Tours`,
            hidden: false,
            locked: false,
            style: { backgroundToken: 'ivory', textAlign: 'center', containerWidth: 'default', paddingTopPx: 40, paddingBottomPx: 48, overlayOpacity: 0, hideOnMobile: false, hideOnTablet: false, hideOnDesktop: false, fontScale: 'default' },
            props: {
              heading: `Explore ${d.name} Tours`,
              subheading: d.heroSubtitle,
              mode: 'DESTINATION',
              destinationSlug: d.slug,
              limit: 8,
              columns: 2,
              showPrice: true,
            },
          },
          {
            id: `dest-cta-${d.slug}`,
            type: 'CallToAction',
            label: `${d.name} Editorial CTA`,
            hidden: false,
            locked: false,
            style: { backgroundToken: 'ivory', textAlign: 'left', containerWidth: 'default', paddingTopPx: 16, paddingBottomPx: 56, overlayOpacity: 0, hideOnMobile: false, hideOnTablet: false, hideOnDesktop: false, fontScale: 'default' },
            props: {
              heading: story.heading,
              body: story.body,
              imageUrl: story.img,
              imageAlt: story.alt,
              ctaLabel: `Explore ${d.name} Tours`,
              ctaHref: `/tours?destination=${d.slug}`,
            },
          },
        ],
      },
    });
  }

  return {
    standardPolicyV1Id: standardPolicyV1.id,
    toursMap,
  };
}

export async function ensureCleanLiveSiteSettings(
  client: PrismaClient,
  opts?: { defaultContactEmail?: string },
): Promise<void> {
  const settings = await client.siteSetting.findUnique({ where: { key: 'singleton' } });
  if (!settings) return;

  const fallbackEmail = (opts?.defaultContactEmail || process.env.SITE_CONTACT_EMAIL || 'reservations@sharmpharaoh.com').trim();
  const nextEmail = !settings.contactEmail || settings.contactEmail.includes('.example') ? fallbackEmail : settings.contactEmail;
  const nextPhone = (settings.contactPhone || '').replace(/\s*\(demo\)\s*/gi, '').trim();
  const nextWhatsapp = (settings.whatsappNumber || '').replace(/\s*\(demo\)\s*/gi, '').trim();

  await client.siteSetting.update({
    where: { key: 'singleton' },
    data: {
      contactEmail: nextEmail,
      contactPhone: nextPhone,
      whatsappNumber: nextWhatsapp,
      payLaterEnabled: true,
    },
  });
}

export async function ensureLiveLegalPagesPublished(client: PrismaClient): Promise<void> {
  for (const lp of LIVE_LEGAL_PAGES) {
    let page = await client.cmsPage.findUnique({
      where: { slug: lp.slug },
      include: { publishedRevision: true },
    });

    const contentDoc: PageContentDocument = {
      schemaVersion: CMS_SCHEMA_VERSION,
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
      page = await client.cmsPage.create({
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
      rawExisting.includes('Draft pending owner review') ||
      rawExisting.includes('Owner Review Notice') ||
      rawExisting.includes('placeholder') ||
      rawExisting.includes('TODO');

    if (needsPublish) {
      const latestRev = await client.cmsRevision.findFirst({
        where: { pageId: page.id },
        orderBy: { revisionNumber: 'desc' },
      });
      const nextNum = (latestRev?.revisionNumber ?? 0) + 1;
      const pubRev = await client.cmsRevision.create({
        data: {
          pageId: page.id,
          revisionNumber: nextNum,
          status: 'PUBLISHED',
          contentJson: contentDoc as unknown as Prisma.InputJsonValue,
          schemaVersion: CMS_SCHEMA_VERSION,
          publishedAt: new Date(),
          notes: 'Published live customer-ready policy',
        },
      });
      const draftRev = await client.cmsRevision.create({
        data: {
          pageId: page.id,
          revisionNumber: nextNum + 1,
          status: 'DRAFT',
          contentJson: contentDoc as unknown as Prisma.InputJsonValue,
          schemaVersion: CMS_SCHEMA_VERSION,
          notes: 'Working draft',
        },
      });
      await client.cmsPage.update({
        where: { id: page.id },
        data: {
          publishedRevisionId: pubRev.id,
          currentDraftId: draftRev.id,
          version: { increment: 1 },
        },
      });
    }
  }
}

export async function provisionInitialOwnerFromEnv(client: PrismaClient): Promise<{
  created: boolean;
  email?: string;
  username?: string | null;
}> {
  const existingOwner = await client.staffUser.findFirst({
    where: { role: 'OWNER', isActive: true },
    select: { id: true, email: true, username: true },
  });
  if (existingOwner) {
    return { created: false, email: existingOwner.email, username: existingOwner.username };
  }

  const password = (process.env.INITIAL_ADMIN_PASSWORD || '').trim();
  if (!password) {
    return { created: false };
  }
  if (password.length < 12) {
    throw new Error('INITIAL_ADMIN_PASSWORD must be at least 12 characters long when set.');
  }

  const email = (process.env.INITIAL_ADMIN_EMAIL || 'owner@sharmpharaoh.com').trim().toLowerCase();
  const username = (process.env.INITIAL_ADMIN_USERNAME || 'owner').trim().toLowerCase() || undefined;
  const fullName = (process.env.INITIAL_ADMIN_NAME || 'Sharm Pharaoh Owner').trim();

  const passwordHash = await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });

  const user = await client.staffUser.upsert({
    where: { email },
    update: {
      ...(username !== undefined ? { username } : {}),
      fullName,
      role: 'OWNER',
      passwordHash,
      isActive: true,
      suspendedAt: null,
    },
    create: {
      email,
      ...(username !== undefined ? { username } : {}),
      fullName,
      role: 'OWNER',
      passwordHash,
      isActive: true,
    },
  });

  await client.auditLog.create({
    data: {
      actorId: user.id,
      actorRole: user.role,
      action: 'ADMIN_BOOTSTRAP_UPSERT',
      targetType: 'StaffUser',
      targetId: user.id,
      afterRedactedJson: {
        email: user.email,
        username: user.username,
        role: user.role,
        source: 'INITIAL_ADMIN_PASSWORD',
      },
    },
  });

  return { created: true, email: user.email, username: user.username };
}
