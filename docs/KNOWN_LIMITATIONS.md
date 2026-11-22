# Known Limitations, Missing External Credentials & Blockers — Sharm Pharaoh Travel

Per the Honesty & Verification Contract (Section 3 of `ANTIGRAVITY_MASTER_PROMPT.md`), this document transparently reports external integrations and host-level items that are **BLOCKED** by missing external credentials or host software, distinguished from internal logic that is **LOCALLY VERIFIED**.

---

## 1. External Integrations Blocked by Missing Live Merchant Credentials

### A. Paymob Live / External Sandbox Merchant Credentials (`BLOCKED` Externally / `LOCALLY VERIFIED` Internally)
- **What is implemented and locally verified**:
  - `PaymobAdapter` (`apps/api/src/payments/paymob.adapter.ts`) implementing the official Paymob Unified Intention API (`POST /v1/intention/`) and canonical 20-field HMAC-SHA512 webhook verification (`computeCanonicalTransactionHmac` / `verifyWebhookHmac`).
  - Signed webhook endpoint (`POST /api/v1/webhooks/paymob`), replay deduplication, out-of-order `FAILED` protection, and late-payment-after-hold-expiry seat reacquisition & `OVERPAYMENT_EXCEPTION` + automatic `RefundRequest` creation (`tests/integration/platform.integration.test.ts` -> `PAY-01 & PAY-02`).
  - Admin configuration UI (`/admin/payments`) displaying `"Not configured"` when credentials are absent, storing write-only secrets encrypted at rest with AES-256-GCM (`CREDENTIALS_ENCRYPTION_KEY`), and returning only masked values (`****...`).
- **What is blocked**:
  - Live external HTTP calls to Paymob's hosted sandbox/production endpoint (`https://accept.paymob.com/v1/intention/`) require the owner's real merchant credentials:
    - `PAYMOB_SECRET_KEY`
    - `PAYMOB_PUBLIC_KEY`
    - `PAYMOB_HMAC_SECRET`
    - `PAYMOB_INTEGRATION_ID_CARD`
  - Until the owner enters these credentials and completes a live sandbox verification transaction, online card checkout remains disabled by default (`PAYMOB_ENABLED=false`) and guests are presented with **Pay Later (Booking Request)** and **Manual Bank Transfer** (if enabled with real bank details).

### B. External Production Transactional Email Provider (`BLOCKED` Externally / `LOCALLY VERIFIED` via Local SMTP Capture)
- **What is implemented and locally verified**:
  - Durable PostgreSQL outbox table (`OutboxJob`) and email delivery audit log (`EmailDelivery`) processed by `apps/worker` over real SMTP (`nodemailer`) to `scripts/local-mail-capture.mjs` (`127.0.0.1:1025`, HTTP inspection API `http://127.0.0.1:8025/api/v1/messages`).
- **What is blocked**:
  - External production email delivery requires real production SMTP credentials (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`) and DNS SPF/DKIM/DMARC records on `sharmpharaoh.com`.

### C. Owner Legal & Company Contact Details (`ACTION REQUIRED BEFORE PRODUCTION CUTOVER`)
- Legal pages (`/p/privacy`, `/p/terms`, `/p/booking-policy`) and company contact fields (`contactEmail`, `contactPhone`, `whatsappNumber`, `addressText`, `bankDetailsJson`) are seeded with clearly labeled demo/draft placeholders in `DEMO_MODE=true`.
- In production (`pnpm db:seed:prod-init`), legal pages are seeded as **unpublished drafts** so placeholder legal copy or placeholder phone numbers never appear on the live production website. The owner must review and publish real company legal copy in `/admin/content` / `/admin/live-editor` before going live.

---

## 2. Host Environment Constraint (No Local Docker Engine Installed)

- **Constraint**: The local Windows development machine does not have Docker Desktop / `docker.exe` installed.
- **Mitigation & Verification**:
  - Production multi-stage Dockerfiles (`infra/docker/Dockerfile.api`, `Dockerfile.web`, `Dockerfile.worker`), reverse-proxy config (`infra/docker/Caddyfile`), and Compose stacks (`infra/compose/docker-compose.dev.yml`, `docker-compose.staging.yml`, `docker-compose.prod.yml`) are authored and syntax-checked in `infra/`.
  - Locally, PostgreSQL 16.4 runs natively (`127.0.0.1:55432`, databases `sharm_pharaoh_dev`, `sharm_pharaoh_test`, `sharm_pharaoh_restore_test`), and `apps/api`, `apps/worker`, `apps/web`, and `scripts/local-mail-capture.mjs` run natively as production builds verified by Vitest and Playwright.
  - Container image build (`docker compose -f infra/compose/docker-compose.prod.yml build`) must be executed on the target Coolify Linux VPS during deployment.
