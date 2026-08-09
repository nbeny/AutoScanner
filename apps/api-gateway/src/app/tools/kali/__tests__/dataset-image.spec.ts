import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Test d'intégration : nécessite Docker + l'image kali-toolbox. Gardé derrière
// KALI_IMAGE_CHECK=1 pour ne pas casser CI/dev sans l'image (25 GB).
const gated = process.env.KALI_IMAGE_CHECK === '1' ? describe : describe.skip;
const IMAGE = process.env.KALI_TOOLBOX_IMAGE ?? 'autoscanner/kali-toolbox:1.0';

gated('dataset ↔ image', () => {
  it('chaque binaire du dataset existe dans l’image', () => {
    const path = join(process.cwd(), 'data', 'kali-tools.json');
    const bins = (JSON.parse(readFileSync(path, 'utf8')) as { binary: string }[]).map(
      (r) => r.binary,
    );
    const script = `for b in ${bins.join(' ')}; do command -v "$b" >/dev/null 2>&1 || echo "MISS $b"; done`;
    const out = execFileSync('docker', ['run', '--rm', IMAGE, 'sh', '-c', script], {
      encoding: 'utf8',
    });
    const missing = out
      .split('\n')
      .filter((l) => l.startsWith('MISS '))
      .map((l) => l.slice(5));
    expect(missing).toEqual([]);
  });
});
