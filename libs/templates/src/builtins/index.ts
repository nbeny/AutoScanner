import type { TemplateDefinition } from '../types';
import { ReconActive } from './recon-active';
import { ReconPassive } from './recon-passive';
import { ReconPassiveDeep } from './recon-passive-deep';
import { WebDeep } from './web-deep';
import { WebQuick } from './web-quick';

export { ReconActive, ReconPassive, ReconPassiveDeep, WebDeep, WebQuick };

/**
 * Source unique de vérité pour les templates intégrés. Consommée par
 * `TemplatesModule.onModuleInit` (registre runtime) et par `prisma/seed.ts`
 * (rangée `ScanTemplate` initiale en base).
 */
export const BUILTIN_TEMPLATES: readonly TemplateDefinition[] = [
  ReconPassive,
  ReconActive,
  ReconPassiveDeep,
  WebQuick,
  WebDeep,
];
