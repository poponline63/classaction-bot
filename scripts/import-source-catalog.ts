import 'dotenv/config';
import {
  importSourceCatalogBundle,
  readSourceCatalogBundle,
} from '../src/lib/source-catalog-transfer';

function argValue(name: string, fallback: string) {
  const prefix = `--${name}=`;
  const value = process.argv.find((item) => item.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
}

async function main() {
  const input = argValue('file', 'data/source-catalog-export.json');
  const dryRun = process.argv.includes('--dry-run');
  const bundle = readSourceCatalogBundle(input);
  const result = await importSourceCatalogBundle(bundle, { dryRun });

  console.log('[import-source-catalog] ok');
  console.log(JSON.stringify({
    file: input,
    bundleFormat: bundle.format,
    bundleExportedAt: bundle.exportedAt,
    ...result,
  }, null, 2));
}

main().catch((error) => {
  console.error('[import-source-catalog] failed');
  console.error(error);
  process.exit(1);
});
