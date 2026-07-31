import { Test } from '@nestjs/testing';
import { ChainsModule, CHAIN_REGISTRY } from '../chains.module';
import { ChainRegistry } from '../registry';

describe('ChainsModule', () => {
  it('provides a ChainRegistry populated with builtins', async () => {
    const mod = await Test.createTestingModule({ imports: [ChainsModule] }).compile();
    const registry = mod.get<ChainRegistry>(CHAIN_REGISTRY);
    expect(registry.has('ip-recon-full')).toBe(true);
    expect(registry.has('web-full')).toBe(true);
  });
});
