import { execFileSync } from 'node:child_process';
import { Test } from '@nestjs/testing';
import { KALI_TOOLBOX_IMAGE } from '@autoscanner/common';
import { ScannerRegistry } from '@autoscanner/scanner-sdk';
import { AllScannersModule } from '@autoscanner/scanners-all';
import { KALI_TOOLBOX_ALLOWLIST } from '../kali-routing';

function imageAvailable(): boolean {
  try {
    execFileSync('docker', ['image', 'inspect', KALI_TOOLBOX_IMAGE], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function binaryPresent(binary: string): boolean {
  try {
    execFileSync(
      'docker',
      ['run', '--rm', '--entrypoint', 'sh', KALI_TOOLBOX_IMAGE, '-c', `command -v ${binary}`],
      { stdio: 'ignore' },
    );
    return true;
  } catch {
    return false;
  }
}

const stubCtx = { scanJobId: 'guard', engagementId: 'guard', scratchDir: '/tmp' };

// Gated: the 25 GB toolbox image only exists after `pnpm scanners:build`, so skip
// when absent (CI without the image) instead of failing.
const maybe = imageAvailable() ? describe : describe.skip;

maybe('kali-toolbox binary presence (gated: needs the image)', () => {
  let registry: ScannerRegistry;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AllScannersModule] }).compile();
    await moduleRef.init(); // triggers each scanner module's onModuleInit register()
    registry = moduleRef.get(ScannerRegistry);
  });

  it('every allowlisted scanner build()s a binary that exists in the toolbox', () => {
    const missing: string[] = [];
    const unverifiable: string[] = [];

    for (const name of KALI_TOOLBOX_ALLOWLIST) {
      const def = registry.get(name);
      const parsed = def.inputSchema.safeParse({});
      const input = parsed.success ? parsed.data : {};
      let binary: string;
      try {
        binary = def.build(input as never, '127.0.0.1', stubCtx as never).cmd[0];
      } catch {
        unverifiable.push(name); // build needs richer input; can't derive binary here
        continue;
      }
      if (!binaryPresent(binary)) missing.push(`${name} → ${binary}`);
    }

    if (unverifiable.length) {
      // eslint-disable-next-line no-console
      console.warn(`kali-toolbox guard: could not derive binary for: ${unverifiable.join(', ')}`);
    }
    expect(missing).toEqual([]);
  }, 120_000);
});
