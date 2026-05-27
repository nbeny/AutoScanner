import { Global, Module, OnModuleInit } from '@nestjs/common';
import { BUILTIN_TEMPLATES } from './builtins';
import { TemplateRegistry } from './registry';

@Global()
@Module({
  providers: [TemplateRegistry],
  exports: [TemplateRegistry],
})
export class TemplatesModule implements OnModuleInit {
  constructor(private readonly registry: TemplateRegistry) {}

  /**
   * Enregistre les templates builtin (`BUILTIN_TEMPLATES`) au démarrage du
   * module. Garde la liste comme source unique de vérité partagée avec le seed.
   * Idempotent: si `onModuleInit` est rejoué (tests qui réinitialisent le
   * module, hot-reload), les noms déjà enregistrés sont sautés au lieu de
   * lever `DuplicateTemplateError`.
   */
  onModuleInit(): void {
    for (const def of BUILTIN_TEMPLATES) {
      if (!this.registry.has(def.name)) {
        this.registry.register(def);
      }
    }
  }
}
