/* Rapport de couverture des options du dataset Kali. Usage: pnpm kali:coverage */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

interface Rec {
  binary: string;
  options: unknown[];
  parseConfidence: 'high' | 'low' | 'none';
  optionsSource?: 'help' | 'man' | 'none';
  helpTextRaw: string | null;
  manAvailable: boolean;
}

const path = process.argv[2] ?? join(process.cwd(), 'data', 'kali-tools.json');
const data = JSON.parse(readFileSync(path, 'utf8')) as Rec[];

const conf: Record<string, number> = { high: 0, low: 0, none: 0 };
const src: Record<string, number> = { help: 0, man: 0, none: 0 };
for (const r of data) {
  conf[r.parseConfidence] = (conf[r.parseConfidence] ?? 0) + 1;
  const s = r.optionsSource ?? 'none';
  src[s] = (src[s] ?? 0) + 1;
}
const none = data
  .filter((r) => r.parseConfidence === 'none')
  .map((r) => r.binary)
  .sort();

console.log(`Kali dataset: ${data.length} tools`);
console.log('parseConfidence:', conf);
console.log('optionsSource :', src);
console.log(`still 'none' (${none.length}):`, none.join(', '));
