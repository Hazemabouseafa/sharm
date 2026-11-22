# Client Acceptance & Release Gate Checklist — Sharm Pharaoh Travel

This checklist maps every release-gate criterion from Section 20 of `Sharm_Pharaoh_Handoff/ANTIGRAVITY_MASTER_PROMPT.md` and `Sharm_Pharaoh_Handoff/CLIENT_ACCEPTANCE_AR.md` to its verification status.

## 1. Brand Identity & Design Fidelity
- [x] **Logo & Emblem Extraction**: Clean transparent normal, inverse, icon-only, and favicon variants extracted into `apps/web/public/brand/` (`logo-normal.png`, `logo-inverse.png`, `logo-icon.png`, `favicon.ico`, `apple-touch-icon.png`).
- [x] **Color Palette & WCAG AA Contrast**: Deep Petrol `#103D45`, Red Sea Turquoise `#18A5A0` (`#0E7C78` on light text backgrounds), Pharaoh Gold `#C9A66B` (`#8A6828` on light text backgrounds), Soft Ivory `#F7F5EF`.
- [x] **English LTR Website**: `<html lang="en" dir="ltr">`; clean English typography (`Manrope` & `Inter`) with zero lorem ipsum or raw full-board screenshot backgrounds.
- [x] **All 8 Required Main Public Pages**:
  - `/` (Home)
  - `/tours` (Tours Listing)
  - `/destinations/cairo` (Cairo Destination)
  - `/destinations/sharm-el-sheikh` (Sharm El Sheikh Destination)
  - `/destinations/marsa-alam` (Marsa Alam Destination)
  - `/destinations/hurghada` (Hurghada Destination)
  - `/destinations/luxor-aswan` (Luxor & Aswan Destination)
  - `/contact` (Contact)
- [x] **Required Transactional & Operational Public Pages**: `/tours/[slug]`, `/checkout`, `/booking/manage`, `/p/[slug]` (`privacy`, `terms`, `booking-policy`, `about`), `/preview`, `/sitemap.xml`, `/robots.txt`, `404`, and error recovery.

## 2. Authoritative Booking Engine & Anti-Overbooking
- [x] **Server-Only Pricing & Integer Minor Units**: `PER_PERSON` (disjoint age bands, per-band `consumesSeat`) and `PRIVATE_GROUP` pricing, add-ons, pickup zone surcharges, promo codes, tax/service fee, and deposits computed exclusively on the server in integer minor units.
- [x] **`Africa/Cairo` DST-Aware Departures**: Scheduled and evaluated in `Africa/Cairo` using `Temporal` (`temporal-polyfill`).
- [x] **Row-Level Locking & `CHECK` Constraints**: `SELECT ... FOR UPDATE` on `Departure` and `Promotion` in deterministic order + PostgreSQL `CHECK` constraints (`departure_allocated_within_capacity`, `promotion_within_max_uses`).
- [x] **20-vs-5 Concurrency Proof**: Verified in `tests/integration/platform.integration.test.ts` (`BOOK-03`: 20 simultaneous booking requests against a 5-seat departure allocate exactly 5 seats and reject 15 with `409 CAPACITY_EXCEEDED`).
- [x] **Idempotency & Immutable Snapshots**: `Idempotency-Key` + SHA-256 request fingerprint prevents duplicate bookings; `snapshotJson` freezes tour, departure, line items, and accepted policy version.
- [x] **Honest Confirmation & Secure Guest Access**: Request/hold states clearly labeled `"Booking request received — awaiting confirmation"`; opaque hashed token exchanged for short-lived `HttpOnly` cookie (`spt_guest_session`); PDFKit generates Request Summary vs Confirmed Voucher with QR check-in token.

## 3. Payments, Webhooks & Financial Integrity
- [x] **Pay Later & Manual Bank Transfer**: Private magic-byte-validated transfer proof upload sets `PaymentStatus = PENDING` and `PaymentProofStatus = PENDING_REVIEW` (never auto-marks paid) until staff verification.
- [x] **Paymob Adapter & HMAC-SHA512 Webhooks**: Official Paymob Intention API adapter + 20-field HMAC-SHA512 webhook verification, replay deduplication, out-of-order `FAILED` protection, and late-payment-after-hold-expiry seat reacquisition or `OVERPAYMENT_EXCEPTION` + `RefundRequest` (`LOCALLY VERIFIED`; live external Paymob calls `BLOCKED` until owner enters merchant credentials).

## 4. Staff `/admin` Dashboard & 3-Pane Visual Live Editor
- [x] **17 Required `/admin` Modules & Server-Side RBAC**: `OWNER`, `MANAGER`, `RESERVATIONS_AGENT`, `CONTENT_EDITOR`, `FINANCE`, `READ_ONLY` enforced on every controller route.
- [x] **3-Pane Visual Live Editor (`/admin/live-editor`)**: `SharedBlockRenderer` shared across public site, signed `/preview`, and editor canvas; 13 typed block schemas; drag/drop + keyboard reorder; undo/redo; debounced autosave; `409 VERSION_CONFLICT` recovery modal; immediate Next.js cache revalidation on publish without rebuild; scheduled publishing; and revision rollback.

## 5. Coolify Deployment & Backup/Restore Verification
- [x] **Coolify Package**: `infra/docker/Dockerfile.{api,web,worker}`, `infra/docker/Caddyfile`, `infra/compose/docker-compose.{dev,staging,prod}.yml`.
- [x] **Encrypted Backup & Disposable Restore Proof**: `pnpm backup:run` & `pnpm backup:restore-verify` verified against `sharm_pharaoh_restore_test` (`docs/qa/backup-restore-report.json`).
