import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  DEMO_MODE: z.string().optional().default('false'),
  PUBLIC_SITE_URL: z.string().url().default('http://localhost:3000'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  WEB_INTERNAL_URL: z.string().url().default('http://127.0.0.1:3000'),
  DATABASE_URL: z.string().min(10, 'DATABASE_URL is required'),
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters'),
  CSRF_SECRET: z.string().min(32, 'CSRF_SECRET must be at least 32 characters'),
  PREVIEW_SIGNING_SECRET: z.string().min(32, 'PREVIEW_SIGNING_SECRET must be at least 32 characters'),
  REVALIDATION_SECRET: z.string().min(32, 'REVALIDATION_SECRET must be at least 32 characters'),
  CREDENTIALS_ENCRYPTION_KEY: z.string().min(32, 'CREDENTIALS_ENCRYPTION_KEY must be at least 32 characters'),
  COOKIE_SECURE: z.string().optional().default('false'),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(1),
  STORAGE_PUBLIC_DIR: z.string().default('./.local-storage/public'),
  STORAGE_PRIVATE_DIR: z.string().default('./.local-storage/private'),
  MAX_UPLOAD_MB: z.coerce.number().int().min(1).max(50).default(10),
  SMTP_HOST: z.string().default('127.0.0.1'),
  SMTP_PORT: z.coerce.number().int().default(1025),
  SMTP_SECURE: z.string().optional().default('false'),
  SMTP_USER: z.string().optional().default(''),
  SMTP_PASS: z.string().optional().default(''),
  EMAIL_FROM: z.string().default('Sharm Pharaoh Travel <noreply@sharmpharaoh.example>'),
  PAYMOB_ENABLED: z.string().optional().default('false'),
  PAYMOB_API_BASE_URL: z.string().default('https://accept.paymob.com'),
  PAYMOB_SECRET_KEY: z.string().optional().default(''),
  PAYMOB_PUBLIC_KEY: z.string().optional().default(''),
  PAYMOB_HMAC_SECRET: z.string().optional().default(''),
  PAYMOB_INTEGRATION_ID: z.string().optional().default(''),
  PAYMOB_CURRENCY: z.string().default('USD'),
  PAYMOB_SANDBOX_VERIFIED: z.string().optional().default('false'),
});

export type AppEnv = z.infer<typeof EnvSchema>;

let cachedEnv: AppEnv | null = null;

export function getAppEnv(): AppEnv {
  if (cachedEnv) return cachedEnv;
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid environment configuration: ${details}`);
  }
  if (parsed.data.NODE_ENV === 'production' && parsed.data.DEMO_MODE === 'true') {
    throw new Error('DEMO_MODE=true is forbidden when NODE_ENV=production');
  }
  cachedEnv = parsed.data;
  return cachedEnv;
}

export function resetAppEnvCache(): void {
  cachedEnv = null;
}
