import { Test } from '@nestjs/testing';
import { ScannerRegistry, ScannerSdkModule, isOsintScanner } from '@autoscanner/scanner-sdk';
import { AllScannersModule } from '@autoscanner/scanners-all';
import { OSINT_PRESETS } from '../osint-presets';

describe('OSINT_PRESETS ⊂ scanners OSINT', () => {
  it('chaque scanner de preset est OSINT par catégorie primaire', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ScannerSdkModule, AllScannersModule],
    }).compile();
    await moduleRef.init();

    const registry = moduleRef.get(ScannerRegistry);
    const names = new Set(
      Object.values(OSINT_PRESETS)
        .flat()
        .map((s) => s.scanner),
    );

    const offenders: string[] = [];
    for (const name of names) {
      if (!registry.has(name)) {
        offenders.push(`${name} (absent du registre)`);
        continue;
      }
      if (!isOsintScanner(registry.get(name))) {
        offenders.push(`${name} (primaire non-OSINT)`);
      }
    }

    expect(offenders).toEqual([]);
  });
});
