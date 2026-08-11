import { join } from 'node:path';
import { Test } from '@nestjs/testing';
import { ScannerRegistry } from '@autoscanner/scanner-sdk';
import { AllScannersModule } from './all-scanners.module';

describe('AllScannersModule (Kali-as-scanner)', () => {
  beforeAll(() => {
    process.env['KALI_TOOLS_DATASET'] = join(__dirname, '__fixtures__', 'mini-dataset.json');
  });
  afterAll(() => delete process.env['KALI_TOOLS_DATASET']);

  it('registers the Kali-generated set and no structured scanners', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AllScannersModule],
    }).compile();
    await moduleRef.init();

    const registry = moduleRef.get(ScannerRegistry);
    expect(registry.has('nmap')).toBe(true);
    // nmap now resolves to the generic Kali def (toolbox image), not the structured one.
    expect(registry.get('nmap').docker.image).toContain('kali-toolbox');
    expect(registry.get('nmap').produces).toEqual([]);
    expect(registry.size()).toBe(2);
  });
});
