import { Test } from '@nestjs/testing';
import { ScannerRegistry, ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { AllScannersModule } from '../all-scanners.module';

describe('AllScannersModule', () => {
  it('registers every Phase 1/2 scanner in the ScannerRegistry', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ScannerSdkModule, AllScannersModule],
    }).compile();
    await moduleRef.init();

    const registry = moduleRef.get(ScannerRegistry);
    for (const name of ['nmap', 'subfinder', 'httpx', 'dnsx', 'naabu', 'nuclei']) {
      expect(registry.has(name)).toBe(true);
    }
  });
});
