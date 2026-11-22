# Quality Assurance & Verification Evidence Report — Sharm Pharaoh Travel

## 1. Automated Verification Summary

| Test Suite | Command | Target Environment | Result |
| --- | --- | --- | --- |
| **TypeScript & Production Builds** | `pnpm build` | `@sharm/contracts`, `@sharm/database`, `@sharm/ui`, `@sharm/api`, `@sharm/worker`, `@sharm/web` (29 Next.js routes) | `PASSED` (Exit Code `0`) |
| **OpenAPI 3.0 Schema Generation** | `pnpm openapi:generate` | `docs/openapi.json` (114 API endpoints) | `PASSED` (Exit Code `0`) |
| **Domain Unit Test Suite** | `pnpm test:unit` | `tests/unit/domain.test.ts` (13 unit tests: money, CSV formula injection neutralization, `PER_PERSON` & `PRIVATE_GROUP` pricing, disjoint age bands, `Africa/Cairo` DST transitions & cutoffs, state machines, RBAC, CMS XSS validation) | `PASSED` (`13/13` passed) |
| **PostgreSQL Integration Test Suite** | `pnpm test:integration` | `tests/integration/platform.integration.test.ts` against `sharm_pharaoh_test` (9 end-to-end integration test suites) | `PASSED` (`9/9` passed) |
| **Encrypted Backup & Disposable Restore Verification** | `pnpm backup:run && pnpm backup:restore-verify` | AES-256-GCM encrypted `pg_dump` + public/private storage restored into `sharm_pharaoh_restore_test` (`docs/qa/backup-restore-report.json`) | `PASSED` (`VERIFIED`, 100% row & SHA-256 file parity) |
| **Live HTTP Smoke Check** | `pnpm smoke` | `http://127.0.0.1:4000/api/v1/health/{live,ready}` & all 8 required public routes + `/admin/login` + `/sitemap.xml` + `/robots.txt` | `PASSED` (`11/11` routes `HTTP 200`) |
| **Playwright Production E2E & Accessibility Suite** | `pnpm test:e2e` | `tests/e2e/platform.spec.ts` against production build (`next start -p 3000`, `apps/api/dist/main.js`, `apps/worker/dist/main.js`, `scripts/local-mail-capture.mjs`) | `PASSED` (`5/5` E2E specs passed; report at `docs/qa/playwright-report.json`) |

---

## 2. Detailed PostgreSQL Integration Evidence (`tests/integration/platform.integration.test.ts`)

1. **`DATA-01` (Test Database Safety Guard)**:
   - Verified `assertDisposableTestDatabase` blocks any database URL not ending with `_test`.
2. **`BOOK-01 & BOOK-02` (End-to-End Guest Booking, Immutable Snapshot, Token Exchange & PDFKit Voucher)**:
   - Verified `POST /api/v1/public/quotes` -> `POST /api/v1/public/bookings` allocates 3 `heldSeats` (2 adults + 1 child + 1 infant with `consumesSeat=false`).
   - Verified editing the tour's title and `pricingVersion` after booking creation leaves `booking.grandTotalMinor` and `booking.snapshotJson.tourTitle` unchanged.
   - Verified reference-only access without `spt_guest_session` cookie returns `401 Unauthorized`.
   - Verified `POST /api/v1/public/booking-access/exchange` sets `HttpOnly` cookie `spt_guest_session`, loads booking state, and streams a valid `%PDF-` summary document.
   - Verified `POST /api/v1/admin/bookings/:id/approve` atomically transitions `heldSeats` to `bookedSeats` and sets `BookingStatus = CONFIRMED`.
3. **`BOOK-03` (20 Simultaneous Booking Requests Against a 5-Seat Departure)**:
   - Created a 5-seat departure (`capacity = 5`, `bookedSeats = 0`, `heldSeats = 0`) and fired 20 concurrent `POST /api/v1/public/bookings` requests via `Promise.all`.
   - Result: Exactly **5 requests succeeded (`201 Created`)**, **15 requests failed with `409 CAPACITY_EXCEEDED`**, and final database allocation was `heldSeats + bookedSeats = 5` (zero overbooking).
4. **`BOOK-04` (Idempotency Key Retry & Conflict)**:
   - Retrying `POST /api/v1/public/bookings` with identical `Idempotency-Key` and payload returned the exact same `bookingId` and `reference` without double-allocating seats.
   - Sending the same `Idempotency-Key` with a mutated payload returned `409 IDEMPOTENCY_CONFLICT`.
5. **`BOOK-05 & BOOK-06` (Hold Expiry, Stale Lease Recovery, Capacity Reduction Guard & Reschedule)**:
   - Verified reducing departure `capacity` below `bookedSeats + heldSeats` is rejected (`409 Conflict`).
   - Verified `POST /api/v1/admin/bookings/:id/reschedule` atomically moves held seats from departure A to departure B.
   - Verified `expireOverdueBookings` releases expired holds back to `0` and transitions the booking to `EXPIRED`.
   - Verified `leaseOutboxJobs` reclaims stale `LEASED` outbox jobs whose `leasedUntilUtc` expired.
6. **`PAY-01 & PAY-02` (Manual Transfer Proof Review, Paymob HMAC-SHA512 Webhooks & Late-Payment Handling)**:
   - Verified guest proof upload (`POST /api/v1/public/booking-access/payment-proofs`) sets `PaymentStatus = PENDING` and `PaymentProofStatus = PENDING_REVIEW` (never auto-marks paid) until `FINANCE` staff verifies it (`POST /api/v1/admin/payments/proofs/:id/review`).
   - Verified forged Paymob webhook HMAC returns `401 Unauthorized` without poisoning the `providerEventId` deduplication key.
   - Verified valid HMAC-SHA512 webhook arriving after hold expiry atomically reacquires seats (`LATE_PAYMENT_REACQUIRED_AND_CONFIRMED`) when capacity remains, deduplicates replays, ignores out-of-order `FAILED` callbacks after `PAID`, and—when the departure sold out during expiry—records `OVERPAYMENT_EXCEPTION`, sets `paidUnfulfilledFlag = true`, and creates a `RefundRequest` (`PAID_BUT_UNFULFILLED_REFUND_QUEUED`).
7. **`CMS-01, CMS-02, CMS-03` (Live Editor Draft Isolation, `409 VERSION_CONFLICT`, Signed Preview, Publish & Rollback)**:
   - Verified draft edits remain isolated from `GET /api/v1/public/cms/page?slug=home`.
   - Verified concurrent editor save with stale `expectedDraftVersion` returns `409 VERSION_CONFLICT`.
   - Verified forged preview token returns `401 Unauthorized` while signed preview link returns the unpublished draft.
   - Verified publish immediately updates the public endpoint and rollback restores the prior revision by creating a new published revision.
8. **`ADMIN-01 & AUTH-01` (RBAC, CSRF, Last-Owner Protection, Session Revocation & TOTP 2FA)**:
   - Verified `CONTENT_EDITOR` is blocked (`403`) from private payment proofs and refunds; `FINANCE` is blocked (`403`) from CMS publishing; `RESERVATIONS_AGENT` is blocked (`403`) from team management.
   - Verified missing `x-csrf-token` on mutating requests returns `403`.
   - Verified demoting or suspending the last active `OWNER` returns `409`.
   - Verified suspending a staff account immediately invalidates their active session cookie (`401`).
   - Verified TOTP 2FA setup/enable and single-use recovery code login (succeeds once, rejected `401` on reuse).
9. **`MEDIA-01` (Magic-Byte Validation & In-Use Media Deletion Guard)**:
   - Verified disguised SVG uploaded as `image/png` is rejected (`400`).
   - Verified deleting a `MediaAsset` referenced by a destination returns `409 RESOURCE_IN_USE` unless `replacementMediaId` is provided.
