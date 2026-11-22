# Implementation Status — Sharm Pharaoh Travel

- **Project**: Sharm Pharaoh Travel (`C:\Users\w.i\.gemini\antigravity\scratch\sharm-pharaoh`)
- **Last Updated**: 2026-11-18
- **Overall Status**: Complete & Verified Locally (Production Build + Unit + PostgreSQL Integration + Playwright E2E + Encrypted Backup/Restore Verification)

---

## Completed Milestones

1. **Workspace & Toolchain Foundation (`packages/*`, `apps/*`, `scripts/*`, `infra/*`)**:
   - `pnpm` monorepo with strict TypeScript configurations and shared domain packages.
   - Brand & photography pipeline (`scripts/process-assets.mjs`) generating transparent logo variants (`logo-normal`, `logo-inverse`, `logo-icon`, `logo-icon-inverse`), favicons, and 20 clean 16:9 WebP + JPEG photo pairs (`1600×900`, EXIF-stripped).

2. **Shared Domain Contracts (`packages/contracts`)**:
   - Integer minor-unit money primitives (`applyBasisPoints`, `assertMinorUnitsInteger`, `formatMinorUnits`, `formatMinorUnitsExact`, `escapeCsvCell`).
   - Authoritative server pricing engine (`computeServerQuote`, `validateDisjointAgeBands`) supporting `PER_PERSON` and `PRIVATE_GROUP` pricing, add-ons, pickup zone surcharges, promo codes, tax/service fee, and deposit calculations.
   - `Africa/Cairo` DST-aware date/time logic via `Temporal` (`cairoLocalToUtc`, `isPastBookingCutoff`, `generateRecurringCairoDates`).
   - Separate `BookingStatus` and `PaymentStatus` state machines + ledger reconciliation (`computePaymentStatusFromLedger`).
   - Full RBAC matrix (`6` roles, `46` permissions) and 13 typed CMS block schemas (`CMS_SCHEMA_VERSION = 1`).

3. **PostgreSQL Database Schema, Constraints & Row-Locking Helpers (`packages/database`)**:
   - Prisma 6 schema and SQL migration (`20261118235546_init_schema/migration.sql`) including PostgreSQL `CHECK` constraints (`departure_allocated_within_capacity`, `promotion_within_max_uses`).
   - Deterministic `SELECT ... FOR UPDATE` row-locking helpers (`lockDeparturesForUpdate`, `lockPromotionForUpdate`, `runWithSerializableRetry`).
   - Durable PostgreSQL outbox job leasing (`leaseOutboxJobs` with `FOR UPDATE SKIP LOCKED` and stale-lease recovery).
   - Overdue hold/request expiration (`expireOverdueBookings`) and scheduled CMS publication executor (`executeDueCmsPublishSchedules`).
   - Production baseline seed (`seed-prod-init.ts`) and idempotent demo seed (`seed-demo.ts`: 5 destinations, 16 tours, 704 rolling Cairo departures, 2 promotions, 4 sample bookings, 12 CMS pages).

4. **NestJS Modular API (`apps/api`) & Durable Worker (`apps/worker`)**:
   - Complete REST API (`/api/v1/*`) across 9 domain modules generating 114 endpoints in `docs/openapi.json`.
   - Argon2id authentication, PostgreSQL `StaffSession` + `HttpOnly` cookie, CSRF token enforcement, Fetch Metadata (`Sec-Fetch-Site`) protection, TOTP 2FA + single-use recovery codes, and last-active-`OWNER` protection.
   - Server-computed expiring quotes, `Idempotency-Key` + SHA-256 fingerprint validation, opaque guest manage token -> `HttpOnly` cookie exchange, and PDFKit voucher/summary generation with QR check-in token.
   - Manual Bank Transfer private proof upload (`magic-byte` verified via `sharp`) and staff verification workflow + Paymob Unified Intention API adapter & 20-field HMAC-SHA512 webhook processor (including late-payment-after-hold-expiry seat reacquisition and `OVERPAYMENT_EXCEPTION` + `RefundRequest` handling).

5. **Next.js 15 App Router Frontend (`apps/web`)**:
   - All 8 required main public pages (`/`, `/tours`, `/destinations/cairo`, `/destinations/sharm-el-sheikh`, `/destinations/marsa-alam`, `/destinations/hurghada`, `/destinations/luxor-aswan`, `/contact`) plus `/tours/[slug]`, `/checkout`, `/booking/manage`, `/p/[slug]`, `/preview`, `/sitemap.xml`, `/robots.txt`, `404`, and error boundary.
   - All 17 staff `/admin` operational modules + 3-pane visual **Live Editor** (`/admin/live-editor`) sharing `SharedBlockRenderer` and immediate Next.js cache revalidation (`/api/internal/revalidate`).

6. **Coolify Deployment Package & Encrypted Backup/Restore Verification**:
   - Multi-stage Node 24 LTS Dockerfiles (`infra/docker/Dockerfile.{api,web,worker}`), same-origin reverse proxy (`infra/docker/Caddyfile`), and Compose stacks (`infra/compose/docker-compose.{dev,staging,prod}.yml`).
   - Automated AES-256-GCM encrypted backup (`scripts/backup-encrypted.mjs`) and disposable restore verification (`scripts/restore-verify.mjs` -> `docs/qa/backup-restore-report.json`).
