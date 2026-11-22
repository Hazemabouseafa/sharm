import 'reflect-metadata';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

const rootEnv = path.resolve(__dirname, '../../../.env');
if (fs.existsSync(rootEnv)) dotenv.config({ path: rootEnv });
else dotenv.config();

import { buildOpenApiDocument, createConfiguredApiApp } from './app-factory';

async function run() {
  const app = await createConfiguredApiApp();
  const doc = buildOpenApiDocument(app);
  const outPath = path.resolve(__dirname, '../../../docs/openapi.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(doc, null, 2));
  console.log(`[openapi] Wrote ${Object.keys(doc.paths ?? {}).length} API paths to ${outPath}`);
  await app.close();
}

run().catch((err) => {
  console.error('[openapi] Failed:', err);
  process.exit(1);
});
