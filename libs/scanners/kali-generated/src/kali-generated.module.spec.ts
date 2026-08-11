import { join } from 'node:path';
import { Test } from '@nestjs/testing';
import { ScannerRegistry } from '@autoscanner/scanner-sdk';
import { KaliGeneratedScannersModule } from './kali-generated.module';

describe('KaliGeneratedScannersModule', () => {
  beforeAll(() => {
    process.env['KALI_TOOLS_DATASET'] = join(__dirname, '__fixtures__', 'mini-dataset.json');
  });
  afterAll(() => delete process.env['KALI_TOOLS_DATASET']);

  it('registers generated scanners into the registry', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [KaliGeneratedScannersModule],
    }).compile();
    await moduleRef.init();

    const registry = moduleRef.get(ScannerRegistry);
    expect(registry.has('nmap')).toBe(true);
    expect(registry.get('nmap').docker.image).toContain('kali-toolbox');
    expect(registry.size()).toBe(2);
  });
});
