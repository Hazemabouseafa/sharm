import 'reflect-metadata';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

// Load monorepo root .env when running locally
const rootEnv = path.resolve(__dirname, '../../../.env');
if (fs.existsSync(rootEnv)) dotenv.config({ path: rootEnv });
else dotenv.config();

import { createConfiguredApiApp } from './app-factory';
import { getAppEnv } from './common/env';

async function bootstrap() {
  const env = getAppEnv();
  const app = await createConfiguredApiApp();
  await app.listen(env.API_PORT, '0.0.0.0');
  console.log(`[api] Sharm Pharaoh Travel API listening on http://127.0.0.1:${env.API_PORT}/api/v1 (NODE_ENV=${env.NODE_ENV}, DEMO_MODE=${env.DEMO_MODE})`);
}

bootstrap().catch((err) => {
  console.error('[api] Fatal startup error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
