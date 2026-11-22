# Staff Admin Dashboard Guide — Sharm Pharaoh Travel

## 1. Accessing the Dashboard & Security

- **URL**: `/admin/login`
- **Provisioning the First Owner Account**:
  ```bash
  pnpm admin:create --email owner@sharmpharaoh.com --name "Sharm Pharaoh Owner" --role OWNER
  ```
- **Session & Authentication**:
  - Sessions are stored in PostgreSQL (`StaffSession`) and bound to an `HttpOnly`, `SameSite=Lax` cookie (`spt_staff_session`) plus a CSRF token header (`x-csrf-token`).
  - **Two-Factor Authentication (TOTP 2FA)**: Enable 2FA under **Settings & Security** (`/admin/settings`). Upon activation, 8 single-use recovery codes are displayed once—store them in your password manager.
  - **Sensitive Actions**: Modifying payment provider secrets, security settings, or disabling 2FA requires recent password re-authentication (`POST /api/v1/admin/auth/reauth`, valid for 15 minutes).

---

## 2. Role-Based Access Control (RBAC) Matrix

| Role | Permitted Responsibilities | Key Restrictions |
| --- | --- | --- |
| `OWNER` | Full system access across all 17 modules, team management, security/payment credentials, customer anonymization | Last active `OWNER` cannot be demoted or suspended |
| `MANAGER` | Bookings, availability, tours, destinations, taxonomy, CMS/Live Editor, media, customers, inquiries, promotions, payment proof verification, reports, audit logs, system health | Cannot manage `OWNER` accounts or edit payment gateway encryption keys |
| `RESERVATIONS_AGENT` | View/create/edit/approve/decline/reschedule bookings, QR check-in, manage availability calendar, customers, inquiries, view payment proofs | Cannot publish CMS pages, issue refunds, or manage team members (`403`) |
| `CONTENT_EDITOR` | Manage tours, destinations, categories/tags/add-ons/policies, CMS pages, Live Editor (draft/publish/schedule/rollback), public media library | Blocked (`403`) from viewing private payment proof files, bookings financial actions, and refunds |
| `FINANCE` | View bookings, verify/reject manual bank transfer proofs, record manual payments, process refunds, export financial/booking CSV reports, view audit logs | Blocked (`403`) from editing or publishing CMS pages or catalog items |
| `READ_ONLY` | Read-only visibility across overview, bookings, availability, catalog, CMS, media, customers, inquiries, promotions, and reports | All mutating (`POST`/`PUT`/`PATCH`/`DELETE`) endpoints return `403` |

---

## 3. Daily Operations Workflows

### A. Reviewing Booking Requests (`/admin/bookings`)
1. Filter by status `REQUESTED` or `HELD`.
2. Click any booking row to inspect the frozen price breakdown, traveler counts, pickup zone/hotel, and event timeline.
3. Click **Approve & Confirm** (`POST /api/v1/admin/bookings/:id/approve`) to atomically convert `heldSeats` into `bookedSeats` and queue the guest's **Confirmed Booking Voucher PDF** email.
4. Click **Decline / Cancel** to release held seats back to inventory and notify the guest with the reason.
5. Click **Reschedule** to atomically move the booking's seats to another open departure date/time.
6. Use **QR Check-In** to verify a guest's voucher check-in token at departure boarding.

### B. Verifying Manual Bank Transfer Proofs (`/admin/payments`)
1. When a guest uploads a transfer receipt in `/booking/manage`, the booking enters `PaymentStatus = PENDING` and the proof enters `PENDING_REVIEW` (never auto-marked paid).
2. In `/admin/payments`, inspect the private proof image/PDF (`GET /api/v1/admin/media/:id/private`, restricted to `payments:proofs:read`).
3. Click **Verify & Record Payment** to verify the amount and currency, write an immutable `MANUAL_PAYMENT` ledger entry, and optionally confirm the booking in the same transaction.
4. If a late online payment arrives after a hold expired and the departure sold out, the booking is flagged with **Paid-but-Unfulfilled (`OVERPAYMENT_EXCEPTION`)** and a `RefundRequest` appears at the top of `/admin/payments` for staff refund processing.

### C. Managing Tours & Cairo Departure Schedules (`/admin/tours` & `/admin/availability`)
1. Create or edit tours in `/admin/tours`. Configure either `PER_PERSON` (disjoint Adult/Child/Infant age bands with per-band `consumesSeat`) or `PRIVATE_GROUP` pricing.
2. Note: **Publish Readiness Checks** block publishing a tour until it has a title, slug, primary image with alt text, valid pricing, active cancellation policy, and at least one upcoming open departure.
3. In `/admin/availability`, generate recurring departure schedules by selecting a date range, ISO weekdays (`Mon`–`Sun`), start time in `Africa/Cairo`, seat capacity, and optional blackout dates.
   - Guardrail: You cannot reduce a departure's capacity below `bookedSeats + heldSeats` (`409 Conflict`).
