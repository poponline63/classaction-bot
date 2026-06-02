import 'dotenv/config';
import { writeSourceCatalogBundle } from '../src/lib/source-catalog-transfer';

function argValue(name: string, fallback: string) {
  const prefix = `--${name}=`;
  const value = process.argv.find((item) => item.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
}

async function main() {
  const output = argValue('out', 'data/source-catalog-export.json');
  const { bundle, outputPath, digestPath, sha256Digest } = await writeSourceCatalogBundle(output);
  console.log('[export-source-catalog] ok');
  console.log(JSON.stringify({
    outputPath,
    digestPath,
    format: bundle.format,
    recordCount: bundle.recordCount,
    exportedAt: bundle.exportedAt,
    sha256Digest,
  }, null, 2));
}

main().catch((error) => {
  console.error('[export-source-catalog] failed');
  console.error(error);
  process.exit(1);
});
