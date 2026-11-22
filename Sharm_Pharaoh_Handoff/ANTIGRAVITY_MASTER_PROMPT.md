# SHARM PHARAOH TRAVEL — COMPLETE IMPLEMENTATION PROMPT

Paste this entire document into Antigravity after putting this handoff folder in the project workspace. Read the local design references as images. This is an implementation assignment: build, run, test and repair the actual application, not a proposal. The image boards are design references, not finished source code.

## 1. Mission and execution contract

Act as a senior full-stack Node.js / Next.js engineer, product designer and QA engineer. Build a complete English-language travel booking website and management system for **Sharm Pharaoh Travel**. Deliver a usable, production-oriented application with a real database, booking workflow, administrative dashboard and visual live website editor.

Do the work continuously in this workspace. Make reasonable reversible technical choices; do not repeatedly ask the owner which library to use. Create an implementation checklist and update it as you work. Implement in dependency order, run each component, fix failures, then verify integrated workflows. A polished front end alone is not completion. Every visible action must have a real, authorized, persistent implementation or be hidden with an honest explanation.

Inspect the repository before changing it. If a relevant project already exists, preserve its valid work, credentials, database and unrelated files. Do not replace or reset it blindly. If empty, initialize the monorepo described below. Never wipe production data, overwrite secrets, run destructive schema resets outside a disposable test database, or deploy automatically to a shared VPS. Prepare deployment artifacts and local/staging verification. A production deployment requires an explicitly identified target and authorization.

Do not use browser localStorage, static arrays, mock endpoints or hardcoded sample numbers as the production source of truth. Development fixtures are permitted only in clearly isolated development/test seeding. Do not declare success based solely on type checking or a screenshot. Do not fabricate test results, delivered email, payment success or production readiness.

External credentials are not a reason to stop implementing unrelated work. Provide fully functional local alternatives where specified. Record genuinely blocked external checks precisely; never simulate a successful external connection in production.

If execution is interrupted, persist `IMPLEMENTATION_STATUS.md` with completed work, current failures and exact next commands. Resume from the checkpoint. Do not knowingly deliver a partial shell as a complete product.

## 2. Brand and reference precedence

Read every image in `design/` and `brand/`. These define the design direction. Preserve the approved pharaoh + wave + sun identity. Use the same logo across public pages, admin, emails and vouchers. Do not invent a different logo. Extract an isolated usable logo from the brand reference or faithfully recreate it with documented provenance; do not use the entire brand presentation as a logo. Supply normal, inverse, icon-only and favicon assets. Do not stretch the artwork or crop away its mark.

The original inspiration is https://www.egyptsunmarine.com/en — use the concept of destination discovery and excursions, not their branding, text, credentials, contact information, testimonials or proprietary assets.

Brand tokens:
- Deep petrol: `#103D45`.
- Sea turquoise: `#18A5A0`.
- Sand gold: `#C9A66B`.
- Warm ivory: `#F7F5EF`.
- White surfaces, dark readable body text, subtle borders and restrained shadows.
- Modern English sans-serif such as locally served Inter or Manrope; use fonts with appropriate licensing.
- Desktop content width about 1200–1320px; generous section spacing; consistent 12-column layout; 14–18px card radii; strong photo hierarchy; visible accessible focus states.

All public and admin UI must be English, LTR, with `lang="en"`. Do not show a language selector for untranslated languages. Keep the content model extensible for future translation without implementing unfinished Arabic pages.

Mockup text and illustrative values are subordinate to correct functioning and these written requirements. Fix any inconsistent text/image associations rather than reproducing them. Exact photo semantics: Cairo = pyramids / Sphinx / Egyptian museums; Sharm El Sheikh = Sinai coast / Ras Mohamed / White Island; Marsa Alam = Abu Dabbab / turtles / Sataya / Hamata; Hurghada = Orange Bay / Giftun; Luxor & Aswan = ancient temples / Nile / feluccas. Never label a pyramid photo as Luxor or a temple photo as Cairo. Sataya is a dolphin-reef excursion, not a mangrove island card.

Use legitimately usable, locally stored image assets. Record sources and licenses in `docs/ASSET_SOURCES.md`. No unlicensed scraping, hotlinked unstable image URLs, fabricated testimonials or invented company claims. Generated scenic references illustrate art direction; final business content and trip facts require owner approval. Seed demo tours only in demo mode.

Create reusable components, not screenshots as webpage backgrounds. All text, cards, filters, navigation, bookings and editorial sections must be genuine HTML/React UI.

## 3. Architecture and reproducible setup

Use Node.js with TypeScript throughout, Next.js App Router for public website and admin, NestJS for a modular backend API, PostgreSQL for durable data, Prisma ORM with SQL migrations where required, and pnpm workspaces. Use supported stable mutually compatible versions, pin exact versions and commit a lockfile. Node.js 24 LTS is an acceptable starting line; verify support/security and dependency compatibility before installation. Do not use alpha/canary packages or blindly mix documentation from different Prisma/Next.js major versions.

Suggested structure:
```
apps/web          # Next.js public site and /admin, shared rendering for editor
apps/api          # NestJS modular API, authoritative business logic
apps/worker       # low-concurrency background jobs
packages/ui       # tokens and shared components
packages/contracts # validated request/response schemas and types
packages/database # Prisma schema, SQL migrations, seed and test factories
infra/            # Docker, reverse proxy and deployment examples
scripts/          # setup, smoke, backup/restore and verification helpers
docs/             # operating guide, architecture, QA, deployment
```

Keep the system small enough for a shared VPS. Use a durable PostgreSQL-backed job queue / transactional outbox with leasing, retries, backoff and deduplication for email, holds, schedules and image work. No need for Redis or microservice infrastructure unless you document a compelling reason. A worker restart must not lose pending jobs. API and worker use the same domain services, not duplicate booking rules.

Serve API and web through one public origin, `/api/v1` to NestJS and the remainder to Next.js. Reserve clearly distinct internal Next routes for preview/revalidation when necessary; document reverse-proxy routing so no endpoint is shadowed. Use a private Docker network for PostgreSQL and internal services. Environment validation must fail clearly for missing required secrets.

Next.js Server Components for SEO/public reads; interactive client components only where needed. Backend DTO/schema validation, typed contracts, centralized error handling, pagination, predictable error codes and correlation IDs. All authorization and booking rules live server-side. Generate an OpenAPI specification and use it to prevent client/server contract drift.

Create `.env.example` with descriptions and no real secrets, `.gitignore`, `.dockerignore`, health endpoints, multi-stage non-root Dockerfiles, dev/staging/production Compose files, and root scripts for setup, development, build, lint, typecheck, unit/integration/E2E tests, migrations and seed. Provide cross-platform Node scripts or PowerShell alternatives for essential local setup; the owner may use Windows.

Local setup must start PostgreSQL and Mailpit, run migrations, seed an explicitly marked demo environment, create a local admin via a secure setup command, and start web/API/worker. Do not ship a reusable default production password. Initial admin credentials are generated or entered securely outside logs. Tests use a distinct disposable database and must refuse to target the configured production database.

## 4. Public pages and navigation

Build these eight main pages with fully working navigation:
1. `/` Home.
2. `/tours` Tours.
3. `/destinations/cairo` Cairo.
4. `/destinations/sharm-el-sheikh` Sharm El Sheikh.
5. `/destinations/marsa-alam` Marsa Alam.
6. `/destinations/hurghada` Hurghada.
7. `/destinations/luxor-aswan` Luxor & Aswan.
8. `/contact` Contact.

Also implement `/tours/[slug]`, booking checkout, confirmation / pending / failed states, secure booking management, editable legal/CMS pages, 404 and error recovery. `/admin` is staff-only. Do not add fake customer-account screens if guest booking already fulfills the requirements.

Header: logo left, navigation, active page state, Book a Trip CTA; responsive accessible mobile menu. Footer: editable links, brand, genuine configured contacts/socials and legal links. WhatsApp button uses an admin-configured number and encoded text; hide it until a valid number exists. Never invent business contact details.

Home: wide scenic sea hero; headline “Egypt. Every journey tells a story.”; subheading “From the wonders of the Red Sea to the timeless beauty of the Pharaohs.”; Explore Tours / Discover Destinations; destination/type/date search; five correct destination cards; featured tours; story / custom-trip CTA; optional real reviews only when approved and present. Search submits URL query parameters to a functional filtered results page.

Tours: real backend filters for destination, activity category, date availability, duration and price range; clear filters; sort by featured/price/duration; pagination and shareable URL state. The date filter must use bookable departures, not merely text matches. Accessible loading, empty, no-results and error states. Price sorting and “from” prices use the actual applicable pricing model/currency and availability. Avoid inventing discounts or scarcity badges.

Destination pages: destination-specific hero, intro, filters, tour cards, highlights, FAQ, editorial CTA and breadcrumbs. Admin can edit each independently while sharing a reusable template. Cards link to correct trip detail pages and display accurate imagery, destination, duration, starting price where configured and View Details.

Tour detail: title, gallery, destination, short description, highlights, duration, activity type, guide languages, location/meeting point, pickup options, minimum age, accessibility information, itinerary, inclusions/exclusions, what to bring, cancellation terms, FAQ and related tours. Responsive sticky booking panel with date, departure, party size, age bands, optional add-ons and transparent total. Disable unavailable dates/options. The panel must not obscure content or keyboard focus on mobile.

Contact: validated inquiry form with name, email, optional phone, destination, message and required privacy acknowledgement where configured. Save inquiries durably, show them in admin, notify through the outbox, show an honest success state. Rate limit and honeypot. Contact methods and optional map appear only if configured. Do not embed a fabricated office location.

Create editable Privacy, Terms, Booking & Cancellation Policy and optional About pages. Seed legal drafts as requiring owner review, not certified legal compliance. Operational booking notices and cancellation terms must agree with configured booking rules.

## 5. Booking product model and pricing

Build an actual booking engine, not a WhatsApp redirect. Guest booking must work without creating an account. Default operational mode is a booking request with pay later or manual transfer. If the owner enables instant-confirm pay-later for a tour, enforce capacity before confirming. Label requests honestly: “Booking request received — awaiting confirmation” is not “Booking confirmed”.

Tour model includes draft/published/archived state; slug; title; destination and categories; rich text; gallery; itinerary; inclusions/exclusions; age rules; pricing model; schedules; blackout dates; capacity; cutoff; pickup zones; add-ons; cancellation rules; SEO; display order; featured flag. Archiving must preserve historical bookings. Prevent publishing tours without required pricing, availability and policy information.

Supported pricing modes: per-person adult/child/infant and private-group fixed price with maximum party size. Define disjoint age bands, minimum adults, maximum party size, seat-consumption rules including infants and optional age collection only when needed. Add-ons have explicit per-person or per-booking basis, eligibility and maximum quantity. Pickup surcharge, tax and service fees have explicit included/excluded definitions. Percent discounts and fees must have documented rounding/order rules. Do not charge unexpected fees at the last step.

One configured selling currency at launch, demo default USD. Persist ISO currency and money in integer minor units using its actual exponent; never floating-point money. The admin can configure the base currency before going live. Later currency changes require versioned new prices; old bookings/payments retain their original currency and totals. No fake exchange-rate conversion. Reports separate currencies if historical records differ.

Schedules: recurring weekdays plus date overrides, specific departure time slots, capacity per departure, booking cutoff, blackout dates, minimum/maximum party sizes, pickup time and optional per-date pricing. Use IANA `Africa/Cairo` for operational dates/times and UTC timestamps for events. Generate recurrence with daylight-saving awareness; do not assume Egypt is permanently UTC+2. Date-only fields must not drift across browser timezones. Show trip date/time in the destination timezone.

Admin can generate departures in a rolling horizon, bulk close/open dates, edit capacity and prices, and see sold/held/remaining seats. Reject capacity reductions below allocated seats. Conflicting schedules and unavailable pickup/add-on combinations must fail validation with useful errors.

Booking workflow:
1. Select valid tour, departure and travelers.
2. Select permitted add-ons and pickup; collect hotel/meeting details when relevant.
3. Enter lead name/email/phone, optional nationality and special requests. Do not collect passport/payment card data unless an explicitly justified future requirement exists.
4. Retrieve a server-computed quote showing base price, add-ons, pickup, discount, tax/fees, due now, due later and grand total.
5. Accept the exact version of booking/cancellation policy and confirm details.
6. Create booking/reservation idempotently on the server and enter the selected payment/request flow.
7. Show accurate status, reference, receipt/summary and secure management access. Send email asynchronously.

Quotes have expiration and pricing version. Store immutable booking snapshots of item titles, prices, quantities, currency, tax, policies and traveler-relevant details. Tour edits do not rewrite an existing booking. Server revalidates quotes on checkout, never trusts browser totals, coupon amounts, payment state or remaining capacity. If a quote changed, require the traveler to accept the new total before placing an order or charging.

## 6. Capacity, idempotency and state machines

Implement explicit documented allowed transitions. Booking status is separate from payment status. Suggested booking statuses: REQUESTED, HELD, CONFIRMED, CANCELLED, EXPIRED, COMPLETED, NO_SHOW. Suggested payment states: UNPAID, PENDING, PARTIALLY_PAID, PAID, PARTIALLY_REFUNDED, REFUNDED, FAILED. Rejected requests become CANCELLED with a reason. No client can directly choose privileged states.

Use PostgreSQL row locking or serializable transactions with bounded retry, consistent lock ordering and database constraints. Inventory is authoritative in PostgreSQL. Prevent double booking even across separate processes. Lock departure inventory and any scarce add-on/promotion rows in the same transaction before allocating. Enforce nonnegative remaining capacity. Distributed worker retries must be idempotent.

Online checkout holds expire by server time (configurable default 15 minutes). Manual requests may hold capacity until a separate decision deadline (demo default 24 hours). Model their allocation explicitly, expire/release them durably, and explain the deadline to customer and staff. Do not hold unpaid requests indefinitely. Confirmation consumes an existing valid allocation or atomically reacquires available capacity; expired requests cannot bypass availability.

Booking creation requires a scoped idempotency key plus request fingerprint; retries with the same key/body return the original result, different body conflicts. Coupon usage limits and single-use claims must be safe under concurrent requests. Finalize or release reserved coupon usage together with booking outcomes.

Persist provider events with unique IDs and signature checks. Replayed or out-of-order callbacks must not double confirm, double refund or roll a paid order backwards. Never confirm payment from the browser return URL. If payment arrives after hold expiration, atomically reacquire seats if possible; otherwise record a paid-but-unfulfilled exception, alert staff and initiate/queue a refund where supported. Never silently oversell or discard the money record. Document this exact path and test it.

Customer cancellation applies the booking's stored policy and cutoff, creates an appropriate refund request if eligible and releases allocation exactly once. Manual staff overrides require a reason and audit record. Reschedule within a transaction, acquiring the new slot before releasing the old one; handle price differences explicitly. Do not silently charge an extra amount. Tour cancellation workflows identify affected travelers and issue the correct notifications/refund tasks.

## 7. Payments and secure booking access

Functional baseline: pay later and manual bank transfer, configurable independently by admin. Manual transfer instructions and payment-proof uploads appear only when real details are configured. Proofs are private, validated uploads. A proof upload never marks a booking paid. Authorized staff verify and record amount/currency/reference, and confirmation follows the inventory rules.

Include an optional Paymob adapter behind a provider interface, using the current official API and documentation at implementation time. Support a real sandbox checkout, signed server callbacks, payment attempts, webhook event ledger, reconciliation and refunds if supported for the configured integration. No card data stored or processed by our app: use provider-hosted checkout. Never invent provider URLs or signatures. Provider secrets are server-only; prefer deployment secrets with masked admin status, while nonsecret settings and enable/disable are managed in admin. If secure encrypted credential editing is implemented, use an external encryption key, write-only masked inputs, restricted permissions and rotation; never return the decrypted secret to the browser.

Do not display online payment if merchant credentials, supported currency, callback URL and sandbox verification are missing. Provide configuration health checks. An adapter with no valid credentials must be labeled “Not configured”; it must not fake payments. Fully test internal payment logic using controlled fixtures, and separately report genuine provider sandbox tests as passed, failed or blocked. Turning payments off does not discard pending callbacks or payment records.

Support full payment or configurable deposit, with clear due-now/due-later ledger. Allow multiple payment attempts but avoid duplicate settlements. Record payment and refund transactions immutably, permissions and reasons for manual entries. Revenue reports distinguish collected, refunded, outstanding and booked value. Do not equate all confirmed reservations with received revenue.

Secure guest access: cryptographically random opaque manage token, stored hashed, scoped to one booking, expiring and revocable. Exchange emailed token for a short-lived secure session and redirect to a clean URL; avoid token leakage in analytics/referrers/logs. A reference number alone must never expose a booking. Provide a rate-limited “send booking access link” recovery flow that responds generically. Downloads, reschedule/cancel actions and payment proofs require appropriate booking-scoped access.

Provide a downloadable PDF voucher for confirmed bookings and a distinctly labeled request summary for pending bookings. No raw personal data in public QR codes. Check-in QR tokens are unguessable and validated by authorized staff; repeated scans are idempotent.

## 8. Admin dashboard and role permissions

Build a polished usable English admin at `/admin`, matching the brand references: persistent navigation, breadcrumbs, global search, filters, tables, forms, bulk actions where safe, loading/empty/error states, confirmation for destructive actions and clear toast feedback. Avoid placeholder pages and dead buttons.

Roles: Owner/Super Admin, Manager, Reservations Agent, Content Editor, Finance, Read Only. Implement explicit permission keys, roles and object-level checks server-side on every route, mutation, export and file access. A hidden navigation link is not authorization. Only owner can manage privileged roles/security/provider configuration; prevent removal or demotion of the last active owner. Content editors cannot read traveler payment proofs or perform refunds. Finance cannot publish content by default. Reservations agents cannot elevate permissions.

Required modules:
- Overview: genuine database metrics by date, collected revenue, booked value, cancellations, upcoming departures, occupancy and pending tasks. Empty database shows zeros, not fake charts.
- Bookings: searchable/filterable table, details and timeline, passenger manifest, assigned staff, private notes, approve/decline, reschedule, cancel, record manual payment, voucher, resend notification and CSV export. Bulk actions validate each row and report partial failures.
- Availability: calendar, recurring schedules, generated departures, blackouts, capacity, slot prices, allocation view, cutoff management and affected-booking warnings.
- Tours: full CRUD, draft/preview/publish/archive, clone as draft, gallery, itinerary, policies, pricing, age bands, add-ons, pickup, FAQs, SEO and related/featured tours.
- Destinations: all five initial destinations, editable content/media, ordering, visibility and tour associations. Support adding future destinations without coding while preserving the initial required routes.
- Categories, add-ons, pickup zones and reusable policies with usage tracking and delete protection.
- Website content: pages, menus, header/footer, global theme, announcement bar, hero, featured selections, reusable sections, custom CMS pages and live editor.
- Media: upload, folder/tag/search, alt text, focal point, crop, metadata and usage. Block deletion of referenced assets or offer a safe replacement workflow. Generate optimized derivatives in bounded background jobs.
- Customers: guest contact summaries, booking history, staff notes with restricted visibility, duplicate-contact handling without unsafe identity merges, data export/anonymization workflow with retention controls. Do not merge two guests based solely on name.
- Inquiries: incoming contact/custom-trip requests, status, assignment and internal notes. No outbound WhatsApp automation unless explicitly configured; buttons can open a composed manual chat.
- Promotions: fixed/percent, date validity, eligible tours, minimum order, usage limits, per-customer limits where identity can be verified, nonstacking default and audit history.
- Payments and refunds: attempts, ledger, webhook status, reconciliation, manual verification, pending refunds, export and provider configuration status.
- Reports: bookings, cash collected, refunds, outstanding balances, destination/tour performance, departure occupancy, CSV export and documented definitions/timezone. Spreadsheet export escapes formula-injection values.
- Team: invite/create accounts, role permissions, suspend, session revocation, reset access and 2FA controls.
- Settings: company/legal details, real contacts, socials, base currency, timezone, booking rules, email templates, SEO defaults, integrations, maintenance banner and retention. Technical deployment secrets remain appropriately protected.
- Audit log: actor, action, target, timestamp, request ID, reason and redacted before/after for sensitive operations. Not editable through normal admin; no passwords/tokens/payment secrets in logs.
- System health: web/API/worker/DB/storage, queue failures, email status, last successful backup and configuration warnings. No exposed database console, shell access or arbitrary server commands in admin.

For every CRUD module implement list + search/filter + create + detail + edit + validation + permitted archive/delete + permissions + persistence. Prevent deletion of entities referenced by financial or booking records. Document exceptions instead of presenting nonfunctional controls.

## 9. Real Live Editor: shared renderer, drafts and publishing

Implement a section-based visual editor, not just a text form with a screenshot preview. All normal marketing content/layout choices must be manageable without code. The editor is a constrained component system, not an arbitrary JavaScript or SQL execution console. Protected booking logic, permissions and system routes remain code-controlled.

Layout: left sections/layers panel; center interactive site preview; right selected-element inspector; top page selector, desktop/tablet/mobile controls, undo/redo, saving state, Preview and Publish. Selecting a section in the preview selects its inspector. Drag/drop reorder and keyboard move-up/down are both available. Add, duplicate, hide/show, rename and delete permitted sections; guard against removing required transactional elements.

Shared typed block registry: Hero, SearchBar, DestinationGrid, TourGrid, RichText, ImageText, ImageGallery, VideoHero with poster/fallback, Benefits, FAQ, CallToAction, ContactForm and Spacer/Divider with bounded values. Menus, header/footer and theme are editable global documents. Destination and tour templates are editable within allowed slots, retaining dynamic query bindings. Search/results/booking checkout cannot be turned into disconnected static cards by the editor.

Each block has a schema, defaults, migrations and real reusable React renderer. Public page, preview and canvas share the SAME components and data contracts. Tour grids can bind to featured tours/destination/category or curated IDs; they must reflect real publication and pricing rules. The CMS never overwrites inventory or financial fields through content edits.

Editable controls: content, images/video poster, focal point, links and CTA labels, colors from validated tokens, font presets/scales, alignment, section width, bounded padding/margins, grid columns, optional background overlay, visibility per breakpoint and SEO. Use structured rich text with sanitization. No arbitrary inline script, raw React, CSS imports or unrestricted HTML.

Model Page/GlobalContent, Draft, immutable Revision, publishedRevisionId and schemaVersion. Public requests read only the published pointer. Draft autosave goes to the database with debouncing, visible saved/error state and optimistic version checks. Autosave failure must not say “Saved”. Warn before leaving unsaved work. Two editors changing the same revision get a visible conflict with compare/reload or duplicate-draft recovery; never silently overwrite.

Undo/redo works within editing sessions. Revision history supports preview, comparison and restoring a past revision into a new draft. Publish validates the entire page and atomically advances the published pointer, records actor/audit data, then invalidates the correct public caches. Rollback publishes a chosen prior revision through the same checks. Support scheduled publication using the durable worker and proper permissions/timezone.

Next.js Draft Mode alone is not authorization. Preview requires an authenticated permitted editor or a short-lived scoped signed link. Validate page/revision and redirect targets; never accept arbitrary redirect URLs. Draft API routes, private assets and unpublished tours remain protected even when requested directly. Preview responses use private/no-store and noindex. Public CDN/server caches must never contain draft content.

If using an iframe preview, same-origin trusted preview only, restrictive CSP and exact-origin/source/schema validation for postMessage. Do not use wildcard target origins or pass auth secrets in messages. Cross-window selection commands must not execute arbitrary code. Controls remain outside public customer markup.

Publishing must update the public website without rebuild/restart. Verify cache invalidation against a production build and a separate unauthenticated browser session, not only development. Use the installed Next.js version's supported revalidation semantics: stale-while-revalidate may show one old response, so choose explicit expiration/revalidation where immediate publication is required. Keep unpublished drafts from invalidating live content. Include global header/footer/theme and dependent tour/destination pages in invalidation.

Acceptance scenario: editor changes hero title and image, reorders destination grid, changes CTA, saves draft, reloads and sees it retained; visitor still sees old version; authorized preview sees draft; publish causes new anonymous visit to see new version without deployment; rollback restores old published content; concurrent editing conflict is detected.

## 10. Data model, audit and recovery

Create a relational schema and ERD for users, roles/permissions, sessions, recovery/2FA; destinations/categories; tours and tour content; departures/inventory; price versions/age bands/add-ons/pickup; quotes, holds, bookings, travelers and booking snapshots; promotions/redemptions; payment attempts/events/ledger/refunds; inquiries; CMS pages/drafts/revisions/publication schedules; media and references; global settings; audit logs; jobs/outbox/email deliveries.

Use database uniqueness, foreign keys, check constraints and indexes supporting real queries. Unique tour/page slugs, provider event IDs, idempotency keys and departure identities. Index departure date/status, booking status/customer/date, published content and queue availability. Use optimistic version columns for mutable administrative records. Not every entity should be JSON; use structured relational data for booking/finance and typed schema-validated JSON for page blocks.

Archive historical products. Maintain immutable booking/payment history and policy snapshots. Define retention separately for inquiries, guest access tokens, personal traveler data, audit and financial records. Anonymization must not falsify financial totals. Document owner-configurable retention and legal-review dependencies without claiming universal compliance.

Database migrations must be deployable using migration deployment commands, not development reset/push in production. Demonstrate migration on an empty database and an upgrade of a populated staging fixture. Design backward-compatible changes for application rollback; do not assume all migrations can be reversed safely.

## 11. Security, accessibility and operational quality

Admin authentication: vetted auth primitives/library integrated with NestJS, strong password hashing such as Argon2id, opaque server-side sessions in HttpOnly Secure SameSite cookies, idle/absolute expiry, session rotation, logout/revoke, login/reset rate limiting, generic recovery responses and hashed short-lived reset tokens. TOTP 2FA for owner/privileged staff with hashed single-use recovery codes and an auditable recovery process. Require privilege checks and recent reauthentication for sensitive settings. No plaintext passwords or auth tokens in localStorage.

CSRF protection for cookie-authenticated mutations, strict origin checks, narrow CORS if ever needed, security headers/CSP, trusted-proxy configuration, structured input validation, query parameter allowlists, safe redirects, output encoding and rich-text sanitization. Prevent IDOR on bookings, documents, customer exports and admin resources. Do not expose staff notes, guest emails, drafts, secrets or internal API errors in public responses.

Uploads: allowlisted MIME plus magic-byte checks, randomized paths, file/pixel limits, image decoding/re-encoding, remove sensitive EXIF, prevent traversal, bounded image processing. Raster image uploads preferred; disallow untrusted SVG or strictly sanitize through a tested pipeline. Payment proofs/documents remain private and authorized. Prevent SSRF: no unrestricted “fetch remote URL” uploads; use controlled uploads or a strict safe importer. Separate public optimized media from private originals/documents.

Durable notification jobs with templates editable through validated fields. Local email goes to Mailpit and is inspectable. Production SMTP requires configuration and test delivery; an SMTP outage does not erase a saved booking. Retries cannot send duplicate confirmations unnecessarily. Provide failed-job views and safe retry actions.

Responsive QA at 360, 390, 768, 1024 and 1440px. WCAG-oriented semantic headings, labeled controls, sufficient contrast, keyboard navigation, dialogs with focus management, accessible errors, reduced motion and meaningful image alt text. Never rely only on color for status. Improve turquoise/gold text combinations if they fail contrast.

Performance: responsive AVIF/WebP where supported, correct sizes, prioritize only the real LCP hero, lazy-load below-fold assets, route/code splitting, no autoplay sound, video with reduced-motion/data-friendly fallback, bounded API pagination, indexed queries and no N+1. Run measured Lighthouse/axe checks and report conditions; target Lighthouse 90+ performance/accessibility/SEO on key public pages but never invent scores or sacrifice correct booking behavior for a score.

SEO: server-rendered published content, metadata and canonical URLs per page, XML sitemap, robots.txt, proper 404/redirect handling and validated structured data only for facts actually present. Admin/checkout/booking management/drafts/staging are noindex and excluded from sitemap. Slug edits create safe redirects; reserved routes cannot be captured by CMS pages. No invented AggregateRating or reviews.

## 12. Deployment for a shared VPS / Coolify

Prepare deployment suitable for Docker + Coolify on an existing shared VPS. Document resource assumptions and measure local/staging consumption; do not promise a fixed server tier can handle unlimited traffic. Build images off the production host where feasible. Avoid parallel resource-heavy builds, runaway Node heaps and unbounded worker concurrency; default worker concurrency 1–2, tune based on measured headroom.

Set real memory/CPU limits in the chosen Compose/runtime mechanism, log rotation, restart policies, health checks, graceful shutdown and readiness ordering. PostgreSQL and uploads use durable named/bind volumes with correct ownership; redeploys must not delete them. Expose only the intended reverse-proxy port; no public PostgreSQL or internal admin tools. Keep local Mailpit and demo seed out of production configuration.

Add liveness/readiness and queue/storage diagnostics, bounded connection pools, structured redacted logs and correlation IDs. Startup must be idempotent. Run migrations once in a controlled deployment job, not in racing replicas. Support a maintenance approach for incompatible schema changes. Document TLS, DNS, trusted proxy, site URL, email sender configuration and payment webhook URLs.

Provide encrypted backup scripts/procedure for PostgreSQL, public/private media and essential configuration/key escrow handled securely. A backup is not verified until restored into a separate disposable environment. Record restore test evidence, retention, destination and owner responsibilities. Never package real secrets into backups delivered with source or print them in logs.

Document safe rollout, health verification and rollback to prior image. Explain data/schema compatibility, backups and the limits of rollback. Do not reboot the shared VPS, remove other containers, change unrelated sites or run global Docker prune. No production deployment in this assignment without explicit target authorization.

## 13. Seed, settings and business-readiness boundaries

Development demo dataset: exactly the five initial destinations, at least 15 coherent tours with distinct appropriate photos, per-person and private-group examples, some unavailable departures, age bands, add-ons, discounts and representative booking states. Use safe fictional example identities; no real customer data. Future dates are generated relative to seed time in Africa/Cairo, so the demo remains testable. Re-running demo seed must not duplicate records.

Production initialization: minimal roles/settings, secure first-owner setup and draft content. Demo tours, fake reviews, demo charts and fictional contact details must never silently appear live. Provide owner review checklist for real prices/currency, trip details, schedules/capacity, cancellation/refund terms, imagery rights, company identity/contact, payment account, sender email and domain. Production setup must clearly distinguish incomplete owner configuration from software failure.

The director can operate all routine business/site modules from admin. The web editor does not replace a developer for arbitrary new code, server provisioning or payment-provider account approval. Do not hide such prerequisites or claim everything is zero-configuration.

## 14. Automated verification and release gate

Create meaningful tests of domain invariants and integrated user journeys. Do not write only component snapshots or tests that duplicate the implementation. Unit tests for pure pricing/policy functions; real PostgreSQL integration tests for inventory/concurrency, auth and persistence; Playwright E2E against the built web/API/worker and disposable seeded database. Use local email capture. External provider fixture tests are separate from true sandbox tests.

Required acceptance matrix with expected evidence:
- WEB-01: all eight required pages load, correct headings/images/nav and responsive layout; all visible CTAs reach the correct action.
- WEB-02: real query filters/sort/pagination, no-results, unavailable dates and direct tour URLs.
- BOOK-01: guest submits pay-later request; database stores correct immutable totals; admin sees it; email is queued/delivered locally; request status is honest.
- BOOK-02: approve request, confirm inventory, generate authorized voucher, customer access works, reference-only access fails.
- BOOK-03: 20 simultaneous requests against five available seats never allocate more than five, including separate app processes if practical; losers get useful responses.
- BOOK-04: retry same submission returns same booking; different payload with same key rejected; capacity and coupon limits remain correct.
- BOOK-05: hold/request expiry, worker downtime/restart, cancellation, reschedule, cutoff, timezone/DST and capacity-reduction constraints.
- BOOK-06: tampered totals/discounts/age quantities/add-on IDs rejected; quote expiry or price changes require reconfirmation.
- PAY-01: manual proof remains pending until authorized verification; correct deposit/balance accounting; wrong amount/currency blocked or flagged.
- PAY-02: verified webhook replay/out-of-order/invalid signature, failed payment, partial refund, late success after hold expiry, no duplicate ledger entries; sandbox evidence separately labeled.
- CMS-01: create/edit/archive a tour and destination through admin; reload persists; public visibility follows publication rules.
- CMS-02: live editor select/reorder/edit/undo/autosave/reload, breakpoint preview, draft isolation, publish and rollback in production build with anonymous visitor.
- CMS-03: concurrent edit conflict, invalid block schema/XSS rejected, unauthenticated draft API and forged preview link blocked.
- ADMIN-01: role matrix and direct API access tests; content editor cannot refund/read private proofs; last owner protected; suspended session revoked.
- AUTH-01: login/logout/reset/2FA flows, expired tokens, login throttling, session protection and CSRF.
- DATA-01: database unavailable gives useful error, no false success; email failure leaves booking saved; queue recovery retries safely.
- MEDIA-01: invalid/oversized uploads, private asset IDOR, in-use deletion protection, correct cropping/alt text.
- OPS-01: clean install, migrations, production build/start, container restart persistence, database+media restore into separate environment.
- QA-01: keyboard/mobile journeys, no broken image/links, no actionable console/network errors, no fake loading loops or silent catch blocks.
- SEC-01: dependency audit and public exposure review; record unresolved findings with impact and reason, never auto-dismiss vulnerabilities.

Run all required checks. Fix failures and rerun the affected suites. Keep real commands, timestamps, exit statuses, reports, screenshots and relevant logs in `docs/qa/` without secrets/PII. Tests requiring an unavailable provider must be marked BLOCKED, not PASS. Production go-live remains blocked on essential external/business setup even when local software checks pass.

Create `docs/FEATURE_MATRIX.md`: requirement → UI route → API/service → persisted model → permission → test/evidence → status. A requirement without an implemented path/test cannot be called complete. Review it against this entire prompt before stopping.

## 15. Exact delivery and final response

Deliver source, lockfile, actual database migrations, isolated demo seed, `.env.example`, Docker/Compose/proxy files, repeatable setup and verification scripts, test suites, OpenAPI, asset/license register and documentation:
- `README.md`: precise quick start and URLs.
- `docs/ARCHITECTURE.md`: versions, modules, ERD, trust boundaries, booking state transitions, pricing rules and cache/editor design.
- `docs/ADMIN_GUIDE.md`: managing tours, availability, requests, payments, content, media, roles, reports and settings.
- `docs/LIVE_EDITOR_GUIDE.md`: edits, drafts, preview, conflicts, publish, rollback and scheduled publishing.
- `docs/DEPLOYMENT_COOLIFY.md`: safe deployment and rollback on a shared VPS.
- `docs/BACKUP_RESTORE.md`: backup policy and actual restore evidence.
- `docs/ACCEPTANCE_CHECKLIST.md`: owner walkthrough and configuration checklist.
- `docs/FEATURE_MATRIX.md`, `docs/QA_REPORT.md`, `docs/KNOWN_LIMITATIONS.md`.
- `IMPLEMENTATION_STATUS.md`: final status or exact resumption checkpoint.

Finish by reporting: what was built, exact installed versions, local run/build/test commands, website/admin URLs, secure first-admin setup method, test counts and evidence, unresolved failures, missing external configuration and go-live blockers. Do not paste passwords or secrets. Distinguish “implemented”, “locally verified”, “sandbox verified” and “production verified”. Only claim the categories actually supported by evidence.

Begin now: inspect workspace and reference images, establish dependencies and schema, implement the integrated product, execute tests, repair defects and complete the delivery package. Do not stop at a plan or ask the owner to implement modules manually.

---

Technical reference entry points (consult documentation matching installed versions):
- https://nodejs.org/en/about/previous-releases
- https://nextjs.org/docs/app/api-reference/functions/draft-mode
- https://nextjs.org/docs/app/guides/draft-mode
- https://nextjs.org/docs/app/api-reference/functions/revalidateTag
- https://nextjs.org/docs/app/api-reference/functions/revalidatePath
- https://www.postgresql.org/docs/current/explicit-locking.html
- https://www.postgresql.org/docs/current/transaction-iso.html
- https://www.prisma.io/docs/
- https://docs.nestjs.com/
