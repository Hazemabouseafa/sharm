const apiBase = process.env.API_BASE_URL || 'http://127.0.0.1:4000/api/v1';
const webBase = process.env.WEB_BASE_URL || 'http://127.0.0.1:4433';

const webRoutes = [
  '/',
  '/tours',
  '/destinations/cairo',
  '/destinations/sharm-el-sheikh',
  '/destinations/marsa-alam',
  '/destinations/hurghada',
  '/destinations/luxor-aswan',
  '/contact',
  '/admin/login',
  '/sitemap.xml',
  '/robots.txt',
];

async function checkUrl(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Smoke check failed for ${url}: HTTP ${res.status}`);
  }
  return res.status;
}

async function main() {
  console.log(`Checking API health at ${apiBase}...`);
  await checkUrl(`${apiBase}/health/live`);
  await checkUrl(`${apiBase}/health/ready`);
  await checkUrl(`${apiBase}/public/tours`);

  console.log(`Checking Web routes at ${webBase}...`);
  for (const route of webRoutes) {
    const status = await checkUrl(`${webBase}${route}`);
    console.log(`  [OK ${status}] ${route}`);
  }
  console.log('All smoke checks passed.');
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
