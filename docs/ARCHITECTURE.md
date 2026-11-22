# Architecture & Domain Design — Sharm Pharaoh Travel

## 1. System Topology

Sharm Pharaoh Travel runs on a single public origin via a reverse proxy (`infra/docker/Caddyfile` in Coolify / Next.js `/api/v1/*` rewrite locally):

- **`/` (Next.js 15 App Router — `apps/web`)**:
  - Public website (`/`, `/tours`, `/tours/[slug]`, `/destinations/[slug]`, `/contact`, `/checkout`, `/booking/manage`, `/p/[slug]`).
  - Signed unpublished draft preview (`/preview?token=...`).
  - Staff `/admin` dashboard (17 operational modules) and 3-pane visual **Live Editor** (`/admin/live-editor`).
  - On-demand cache invalidation endpoint (`POST /api/internal/revalidate`) protected by `x-revalidate-secret` so CMS publishes and tour/destination updates appear live immediately without a rebuild or container restart.
- **`/api/v1/*` (NestJS 11 Modular API — `apps/api`)**:
  - Modules: `AuthModule`, `CatalogModule`, `AvailabilityModule`, `BookingModule`, `PaymentsModule`, `CmsModule`, `CrmModule`, `MediaModule`, `AdminModule`.
  - Enforces server-side RBAC, CSRF validation, Fetch Metadata resource isolation (`Sec-Fetch-Site`), correlation IDs, structured error codes, and rate limiting.
- **Durable PostgreSQL Background Worker (`apps/worker`)**:
  - Uses PostgreSQL `FOR UPDATE SKIP LOCKED` job leasing (`leaseOutboxJobs`) with automatic stale-lease recovery (`("leasedUntilUtc" <= (${now} AT TIME ZONE 'UTC'))`).
  - Processes transactional email delivery (`SEND_EMAIL`), expired hold & request cleanup (`expireOverdueBookings`), scheduled CMS publishing (`executeDueCmsPublishSchedules`), and Next.js cache revalidation (`TRIGGER_REVALIDATION`).
- **PostgreSQL 16 (`packages/database`)**:
  - Single source of truth for catalog, departures, quotes, bookings, immutable payment ledger, CMS revisions, outbox jobs, sessions, and audit logs.

---

## 2. Transactional Inventory & Anti-Overbooking Design

1. **Row-Level Locking & Consistent Lock Ordering**:
   - Every seat allocation, approval, expiration, cancellation, or reschedule locks affected `Departure` rows in ascending `id` order using `SELECT ... FROM "Departure" WHERE id IN (...) ORDER BY id ASC FOR UPDATE` (`lockDeparturesForUpdate`), followed by `Promotion` row lock (`lockPromotionForUpdate`) if a coupon is present.
   - Serializable / deadlock retry wrapper (`runWithSerializableRetry`) retries transient `40001` / `40P01` serialization conflicts safely.
2. **Database-Level Integrity Constraints**:
   - Migration `20261118235546_init_schema/migration.sql` enforces PostgreSQL `CHECK` constraints directly on `"Departure"` and `"Promotion"`:
     - `departure_allocated_within_capacity`: `"bookedSeats" >= 0 AND "heldSeats" >= 0 AND "capacity" >= 1 AND ("bookedSeats" + "heldSeats") <= "capacity"`
     - `promotion_within_max_uses`: `"usedCount" >= 0 AND ("maxTotalUses" IS NULL OR "usedCount" <= "maxTotalUses")`
3. **Immutable Booking Snapshots**:
   - At booking creation, `snapshotJson` freezes the tour title, slug, departure date/time in `Africa/Cairo`, meeting point, itemized price line items, pricing version, and exact accepted cancellation policy version (`policyVersionId`, `policyMarkdown`, refund tier hours/bps). Editing a tour's price or policy later never alters historical bookings.

---

## 3. Separate Booking & Payment State Machines

- **`BookingStatus`**: `REQUESTED`, `HELD`, `CONFIRMED`, `CANCELLED`, `EXPIRED`, `COMPLETED`, `NO_SHOW`.
- **`PaymentStatus`**: `UNPAID`, `PENDING`, `PARTIALLY_PAID`, `PAID`, `PARTIALLY_REFUNDED`, `REFUNDED`, `FAILED`.
- **Authoritative Payment Ledger (`PaymentLedgerEntry`)**:
  - `PaymentStatus` is derived from the sum of immutable `CAPTURE`, `MANUAL_PAYMENT`, `REFUND`, and `OVERPAYMENT_EXCEPTION` ledger rows (`computePaymentStatusFromLedger`).
  - Out-of-order `FAILED` webhooks arriving after a verified `CAPTURE` never roll a `PAID` booking backward.
- **Late Payment After Hold Expiration**:
  - If a signed Paymob webhook arrives after a booking hold has already transitioned to `EXPIRED`:
    1. Under a `FOR UPDATE` lock on the `Departure`, if `remainingSeats >= seatsAllocated` and the departure is `OPEN`, the system atomically reacquires the seats into `bookedSeats` and transitions the booking to `CONFIRMED` + `PAID`.
    2. If the departure sold out while the hold was expired, the system **never oversells** and **never discards the money record**: it records an `OVERPAYMENT_EXCEPTION` ledger entry, sets `paidUnfulfilledFlag = true` on the booking, creates a `RefundRequest` (`PENDING`), and queues a priority staff alert.

---

## 4. Visual Live Editor & Shared Block Renderer

- **`SharedBlockRenderer` (`apps/web/src/components/cms/SharedBlockRenderer.tsx`)**:
  - Used identically by public pages, `/preview`, and the Live Editor center canvas.
- **Revision Isolation**:
  - `CmsPage` maintains separate pointers for `publishedRevisionId` and `currentDraftId`.
  - Editing or autosaving a draft updates only the `DRAFT` revision (`currentDraftId`) with optimistic concurrency checking (`expectedDraftVersion` -> `409 VERSION_CONFLICT` on concurrent edits, offering a safe "Save My Work as Duplicate Draft" recovery).
  - Publishing validates the full block tree against Zod schemas, advances `publishedRevisionId`, spawns a fresh working draft, logs an `AuditLog` entry, and triggers immediate Next.js cache revalidation (`/api/internal/revalidate`).
