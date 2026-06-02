const {
  collectNextStaticHealth,
  formatNextStaticHealthFailure,
} = require('./lib/next-static-health.cjs');

const baseUrl = process.env.LOCAL_DEV_BASE_URL || process.env.SMOKE_BASE_URL || 'http://localhost:3100';

async function main() {
  const health = await collectNextStaticHealth(baseUrl);
  if (!health.ok) {
    console.error('[local-dev-server] failed');
    console.error(formatNextStaticHealthFailure(health));
    process.exit(1);
  }

  console.log('[local-dev-server] ok');
  console.log(`Base URL: ${baseUrl}`);
  console.log(`App shell: HTTP ${health.htmlStatus}`);
  console.log(`Next static chunks checked: ${health.checkedScripts.length}`);
}

main().catch((error) => {
  console.error('[local-dev-server] failed');
  console.error(error);
  process.exit(1);
});
