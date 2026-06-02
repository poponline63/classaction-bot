const { findNextRouteExportHygieneLeaks } = require('./lib/next-route-export-hygiene.cjs');

const result = findNextRouteExportHygieneLeaks(process.cwd());

if (result.leaks.length > 0) {
  console.error('[validate-next-route-exports] failed');
  for (const leak of result.leaks) console.error(`- ${leak.message}`);
  process.exit(1);
}

console.log(`[validate-next-route-exports] ok: ${result.routeFiles.length} route files checked`);
