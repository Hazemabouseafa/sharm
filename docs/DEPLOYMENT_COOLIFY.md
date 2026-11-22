# Coolify VPS Deployment Runbook — Sharm Pharaoh Travel

## 1. Deployment Topology

Production deployment uses `infra/compose/docker-compose.prod.yml` and `infra/docker/Caddyfile`:

1. **`proxy` (Caddy 2.8)**:
   - Public entry point on ports `80`/`443` for `${PUBLIC_DOMAIN}`.
   - Routes `/api/v1/*` and `/public-media/*` to `api:4000`, and `/*` to `web:3000` on a single public origin so `HttpOnly`, `SameSite=Lax`, `Secure` cookies work without cross-site cookie workarounds.
2. **`postgres` (PostgreSQL 16.4 Alpine)**:
   - Private internal network (`sharm_internal`); port `5432` is **never** exposed to the public internet.
   - Backed by durable named volume `postgres_prod_data`.
3. **`migrate` (One-Shot Pre-Start Job)**:
   - Waits for `postgres` healthcheck (`pg_isready`), then runs `pnpm db:migrate:deploy && pnpm db:seed:prod-init` (`restart: "no"`).
   - Never runs demo seed data (`seed:demo` refuses to run when `NODE_ENV=production`).
4. **`api` (NestJS 11 API, Node 24 LTS slim, non-root `node` user)**:
   - Starts only after `migrate` completes (`service_completed_successfully`).
   - Mounts `public_prod_storage` (`/app/storage/public`), `private_prod_storage` (`/app/storage/private`), and `backup_prod_storage` (`/app/storage/backups`).
   - Healthcheck: `GET http://127.0.0.1:4000/api/v1/health/ready`.
5. **`worker` (Durable PostgreSQL Outbox Worker, `WORKER_CONCURRENCY=2`)**:
   - Mounts the same `public_prod_storage`, `private_prod_storage`, and `backup_prod_storage` volumes.
6. **`web` (Next.js 15 Production Server)**:
   - Starts after `api` is healthy; exposes internal `/api/internal/revalidate` endpoint for instant Live Editor cache invalidation.

---

## 2. Required Coolify Environment Variables

Configure these secrets in your Coolify Service Environment tab (fail-fast validation rejects missing secrets at startup):

```dotenv
PUBLIC_DOMAIN=sharmpharaoh.com
PUBLIC_SITE_URL=https://sharmpharaoh.com
PUBLIC_API_URL=https://sharmpharaoh.com/api/v1

POSTGRES_USER=sharm_prod
POSTGRES_PASSWORD=<generate-32-byte-secret>
POSTGRES_DB=sharm_pharaoh_prod
DATABASE_URL=postgresql://sharm_prod:<password>@postgres:5432/sharm_pharaoh_prod?schema=public

SESSION_SECRET=<generate-64-char-random-secret>
CSRF_SECRET=<generate-64-char-random-secret>
PREVIEW_TOKEN_SECRET=<generate-64-char-random-secret>
GUEST_TOKEN_PEPPER=<generate-64-char-random-secret>
REVALIDATE_SHARED_SECRET=<generate-64-char-random-secret>
CREDENTIALS_ENCRYPTION_KEY=<64-hex-char-32-byte-aes-key>
BACKUP_ENCRYPTION_PASSPHRASE=<generate-32-char-passphrase>

SMTP_HOST=<production-smtp-host>
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=<production-smtp-user>
SMTP_PASS=<production-smtp-password>
SMTP_FROM=reservations@sharmpharaoh.com

# Optional Paymob Online Checkout (keep false until merchant credentials & sandbox verification complete)
PAYMOB_ENABLED=false
PAYMOB_SECRET_KEY=
PAYMOB_PUBLIC_KEY=
PAYMOB_HMAC_SECRET=
PAYMOB_INTEGRATION_ID_CARD=
```

---

## 3. First-Time Production Cutover Steps

1. In Coolify, create a **Docker Compose** resource pointing to `infra/compose/docker-compose.prod.yml`.
2. Paste the environment variables above and click **Deploy**.
3. Wait for `postgres` -> `migrate` -> `api`, `worker`, `web`, and `proxy` healthchecks to turn green.
4. Open a terminal into the `api` container in Coolify and provision the initial `OWNER` account:
   ```bash
   node scripts/create-admin.mjs --email owner@sharmpharaoh.com --name "Sharm Pharaoh Owner" --role OWNER
   ```
5. Log in at `https://sharmpharaoh.com/admin/login`, enable TOTP 2FA under `/admin/settings`, and complete real company contact/legal details before publishing legal pages (`/p/privacy`, `/p/terms`, `/p/booking-policy`).
