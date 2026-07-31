import { Module } from '@nestjs/common';
import { ChainRegistry } from './registry';
import { BUILTIN_CHAINS } from './builtins';

/** Token DI pour le registre de chaînes peuplé. */
export const CHAIN_REGISTRY = Symbol('CHAIN_REGISTRY');

/**
 * Fournit un {@link ChainRegistry} chargé avec toutes les chaînes builtin.
 * Miroir de `TemplatesModule`. Consommé par l'API (catalogue + launcher) et le
 * worker (ChainDecider).
 */
@Module({
  providers: [
    {
      provide: CHAIN_REGISTRY,
      useFactory: (): ChainRegistry => {
        const registry = new ChainRegistry();
        for (const chain of BUILTIN_CHAINS) registry.register(chain);
        return registry;
      },
    },
  ],
  exports: [CHAIN_REGISTRY],
})
export class ChainsModule {}
