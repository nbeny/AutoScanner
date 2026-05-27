import type { TemplateDefinition } from '../types';
import { ReconPassive } from './recon-passive';

export { ReconPassive };

/**
 * Source unique de vérité pour les templates intégrés. Consommée par
 * `TemplatesModule.onModuleInit` (registre runtime) et par `prisma/seed.ts`
 * (rangée `ScanTemplate` initiale en base).
 */
export const BUILTIN_TEMPLATES: readonly TemplateDefinition[] = [ReconPassive];
