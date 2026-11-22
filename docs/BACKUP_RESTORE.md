# Encrypted Backup & Restore Verification Guide — Sharm Pharaoh Travel

## 1. Encrypted Backup (`pnpm backup:run`)

`scripts/backup-encrypted.mjs` produces an authenticated AES-256-GCM backup archive containing:
1. Full PostgreSQL logical dump via `pg_dump --no-owner --no-acl --clean --if-exists` plus its SHA-256 checksum.
2. Complete snapshot of `storage/public` (uploaded media variants) and `storage/private` (guest payment transfer proof images/PDFs) with per-file SHA-256 checksums.
3. PBKDF2-SHA256 (`210,000` iterations, random 16-byte salt) key derivation from `BACKUP_ENCRYPTION_PASSPHRASE` and AES-256-GCM encryption (random 12-byte IV, 16-byte authentication tag).
4. Output files written to `storage/backups/backup-<ISO-timestamp>.enc` and `storage/backups/backup-latest.enc` with automatic 30-file retention cleanup.

---

## 2. Non-Destructive Restore Verification (`pnpm backup:restore-verify`)

`scripts/restore-verify.mjs` proves that the encrypted backup can be decrypted and restored without ever touching the active production or development database:

1. Reads `storage/backups/backup-latest.enc`, derives the AES-256-GCM key from `BACKUP_ENCRYPTION_PASSPHRASE`, verifies the GCM authentication tag, and verifies the decrypted SQL dump SHA-256 digest.
2. Connects to PostgreSQL and creates a disposable verification database `sharm_pharaoh_restore_test` (strictly refusing if `sharm_pharaoh_restore_test` matches the active database in `DATABASE_URL`).
3. Restores the SQL dump into `sharm_pharaoh_restore_test` via `psql -v ON_ERROR_STOP=1`.
4. Restores all public and private storage files into a disposable `.local-restore-verify/storage` directory and verifies every file's SHA-256 checksum.
5. Queries row counts (`destinations`, `tours`, `tourDepartures`, `bookings`, `cmsPages`, `cmsPageVersions`) from both the source database and `sharm_pharaoh_restore_test`, asserts 100% parity, writes the verification evidence to `docs/qa/backup-restore-report.json`, and cleans up `.local-restore-verify`.
