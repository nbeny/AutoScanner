import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { rawLinesToDataset } from '../../apps/api-gateway/src/app/tools/kali/generate-transform';

// usage: tsx tools/kali-catalog/generate.ts <raw.jsonl> <kaliRelease>
const [rawPath, release] = process.argv.slice(2);
if (!rawPath || !release) {
  console.error('usage: tsx tools/kali-catalog/generate.ts <raw.jsonl> <kaliRelease>');
  process.exit(1);
}
const capturedAt = new Date().toISOString();
const ds = rawLinesToDataset(readFileSync(rawPath, 'utf8'), release, capturedAt);
const out = join(process.cwd(), 'data', 'kali-tools.json');
writeFileSync(out, JSON.stringify(ds, null, 2));
const withHelp = ds.filter((r) => r.helpTextRaw != null).length;
console.log(
  `Wrote ${ds.length} tools to ${out} (${withHelp} with help, ${ds.length - withHelp} help-less)`,
);
