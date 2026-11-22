# Sharm Pharaoh Travel — Egypt Excursions, Booking Engine, RBAC Admin & Live Editor

Production-ready English-language travel & excursions platform for **Sharm Pharaoh Travel** (`https://sharmpharaoh.com`), built as a TypeScript monorepo with Next.js 15 App Router, NestJS 11 modular API, Prisma 6 + PostgreSQL 16 transactional inventory engine, durable PostgreSQL background worker, full RBAC staff `/admin` dashboard, and a 3-pane visual **Live Editor**.

---

## 1. Repository Architecture

```text
sharm-pharaoh/
├── apps/
│   ├── web/                  # Next.js 15 App Router (Public site, /preview, /admin, /admin/live-editor)
│   ├── api/                  # NestJS 11 REST API (/api/v1/*) + OpenAPI generator
│   └── worker/               # Durable PostgreSQL outbox & scheduled job worker (FOR UPDATE SKIP LOCKED)
├── packages/
│   ├── contracts/            # Shared TypeScript types, Zod schemas, pricing engine, Temporal Cairo dates, RBAC
│   ├── database/             # Prisma 6 schema, SQL migrations + CHECK constraints, row-lock inventory helpers, seeds
│   └── ui/                   # Brand tokens, BrandLogo, NativeDialog (<dialog>), MobileNavDrawer, StatusBadge
├── infra/
│   ├── docker/               # Multi-stage Node 24 LTS Dockerfiles (api, web, worker) + same-origin Caddyfile
│   └── compose/              # docker-compose.dev.yml, docker-compose.staging.yml, docker-compose.prod.yml
├── scripts/                  # Setup, admin bootstrap, encrypted backup/restore verification, local SMTP capture
├── tests/                    # Vitest unit tests, PostgreSQL integration tests, Playwright E2E browser tests
└── docs/                     # OpenAPI spec, architecture, admin/editor guides, Coolify guide, QA & feature matrix
```

---

## 2. Quick Start (Local Development)

### Prerequisites
- Node.js `>=20.18.0` (Node 24 LTS recommended in production containers)
- `pnpm@10.34.9`
- PostgreSQL `16.x`

### Step-by-Step Setup

1. **Install dependencies**
   ```bash
   pnpm install
   ```

2. **Configure environment**
   ```bash
   cp .env.example .env
   ```
   Verify `DATABASE_URL` and `TEST_DATABASE_URL` in `.env`.

3. **Run database migrations & production-safe baseline initialization**
   ```bash
   pnpm db:generate
   pnpm db:migrate:deploy
   pnpm db:seed:prod-init
   ```

4. **Seed rich demo catalog (development/staging only — refused in `NODE_ENV=production`)**
   ```bash
   pnpm db:seed:demo
   ```
   Seeds 5 destinations (`Cairo`, `Sharm El Sheikh`, `Marsa Alam`, `Hurghada`, `Luxor & Aswan`), 16 tours across `PER_PERSON` and `PRIVATE_GROUP` pricing modes, 700+ rolling `Africa/Cairo` departures, 2 promotions, 4 sample bookings, and 12 CMS pages.

5. **Provision the initial `OWNER` staff administrator**
   ```bash
   pnpm admin:create --email owner@sharmpharaoh.com --name "Sharm Pharaoh Owner" --role OWNER
   ```
   - Never uses hardcoded production credentials.
   - If `INITIAL_ADMIN_PASSWORD` is not set in the environment, generates a cryptographically strong one-time password and writes it to `.local-admin-bootstrap.json` (gitignored, mode `0600`).

6. **Start all services**
   ```bash
   pnpm dev
   ```
   - Public Website & Admin UI: `http://localhost:3000`
   - REST API: `http://localhost:4000/api/v1` (proxied same-origin at `http://localhost:3000/api/v1/*`)
   - Local SMTP Capture: `127.0.0.1:1025` (HTTP JSON viewer at `http://127.0.0.1:8025/api/v1/messages`)

---

## 3. Verification & Test Suites

| Command | Description |
| --- | --- |
| `pnpm build` | Builds `@sharm/contracts`, `@sharm/database`, `@sharm/ui`, `@sharm/api`, `@sharm/worker`, and `@sharm/web` |
| `pnpm openapi:generate` | Generates `docs/openapi.json` from the NestJS API controllers |
| `pnpm test:unit` | Runs pure domain unit tests (pricing, money, `Africa/Cairo` DST, state machines, RBAC, CMS schemas) |
| `pnpm test:integration` | Runs full PostgreSQL integration tests against `sharm_pharaoh_test` (including 20-request vs 5-seat concurrency test) |
| `pnpm test:e2e` | Runs Playwright E2E browser + axe-core accessibility tests against the production build |
| `pnpm backup:run` | Creates an AES-256-GCM encrypted backup of PostgreSQL + public/private storage |
| `pnpm backup:restore-verify` | Decrypts and restores the backup into a disposable `sharm_pharaoh_restore_test` database and verifies row counts & SHA-256 file hashes |
| `pnpm smoke` | Runs live HTTP health and route smoke checks |

---

## 4. Key Documentation

- [Architecture & Domain Design](docs/ARCHITECTURE.md)
- [Staff Admin Dashboard Guide](docs/ADMIN_GUIDE.md)
- [3-Pane Visual Live Editor Guide](docs/LIVE_EDITOR_GUIDE.md)
- [Coolify VPS Deployment Runbook](docs/DEPLOYMENT_COOLIFY.md)
- [Encrypted Backup & Restore Verification Guide](docs/BACKUP_RESTORE.md)
- [Feature Traceability Matrix](docs/FEATURE_MATRIX.md)
- [QA Report & Test Evidence](docs/QA_REPORT.md)
- [Acceptance Checklist](docs/ACCEPTANCE_CHECKLIST.md)
- [Asset Sources & Provenance](docs/ASSET_SOURCES.md)
- [Known Limitations & External Blockers](docs/KNOWN_LIMITATIONS.md)
- [OpenAPI 3.0 Specification](docs/openapi.json)
