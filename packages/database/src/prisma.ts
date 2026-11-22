import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { __sharmPrisma?: PrismaClient };

export function createPrismaClient(databaseUrl?: string): PrismaClient {
  return new PrismaClient({
    datasources: databaseUrl ? { db: { url: databaseUrl } } : undefined,
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });
}

export const prisma: PrismaClient =
  globalForPrisma.__sharmPrisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.__sharmPrisma = prisma;
}

/**
 * Safety guard: refuses to allow destructive test resets against production or primary DATABASE_URL.
 */
export function assertDisposableTestDatabase(targetUrl: string): void {
  if (!targetUrl) {
    throw new Error('TEST_DATABASE_URL is required for automated tests');
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to run test database operations when NODE_ENV=production');
  }
  const primary = process.env.DATABASE_URL;
  if (primary && primary === targetUrl && !targetUrl.includes('_test')) {
    throw new Error('Refusing to target primary DATABASE_URL for destructive tests; configure a distinct *_test database');
  }
  let parsed: URL;
  try {
    parsed = new URL(targetUrl);
  } catch {
    throw new Error('Invalid TEST_DATABASE_URL format');
  }
  const dbName = parsed.pathname.replace(/^\//, '');
  if (!/(test|spec|disposable|restore)/i.test(dbName)) {
    throw new Error(`Refusing destructive reset on database "${dbName}": name must include test/spec/disposable/restore`);
  }
}
