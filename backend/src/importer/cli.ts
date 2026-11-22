import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { importDeals } from './importDeals.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const inputPath = path.resolve(process.argv[2] ?? path.join(root, 'Data', 'Deals_sample.csv'));
const outDir = path.resolve(process.argv[3] ?? path.join(root, 'Data', 'processed'));

try {
  const workerDataPath = path.join(root, 'backend', 'src', 'data', 'deals.json');
  const { deals, report, outputs } = await importDeals({ inputPath, outDir, workerDataPath });
  const r = report as { counts: Record<string, number>; rejected_by_reason: Record<string, number>; quality_flag_counts: Record<string, number> };

  console.log(`Input : ${inputPath}`);
  console.log('\nCounts');
  console.table(r.counts);
  console.log('Rejected by reason:', r.rejected_by_reason);
  console.log('Quality flags     :', r.quality_flag_counts);
  console.log('\nSample cleaned record:');
  console.log(JSON.stringify(deals.find((d) => d.quality_flags.length === 0) ?? deals[0], null, 2));
  console.log('\nWrote:');
  for (const f of Object.values(outputs)) console.log('  ' + f);
  console.log('  (the last file is the slim copy bundled into the Cloudflare Worker)');
} catch (err) {
  console.error('Import failed:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
}
