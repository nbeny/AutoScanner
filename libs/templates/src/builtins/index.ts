import type { TemplateDefinition } from '../types';
import { OsintPassive } from './osint-passive';
import { OsintPassiveDeep } from './osint-passive-deep';
import { ReconActive } from './recon-active';
import { ReconPassive } from './recon-passive';
import { ReconPassiveDeep } from './recon-passive-deep';
import { ServiceRecon } from './service-recon';
import { VulnActive } from './vuln-active';
import { WebContent } from './web-content';
import { WebDeep } from './web-deep';
import { WebEnrich } from './web-enrich';
import { WebFingerprint } from './web-fingerprint';
import { WebQuick } from './web-quick';

export {
  OsintPassive,
  OsintPassiveDeep,
  ReconActive,
  ReconPassive,
  ReconPassiveDeep,
  ServiceRecon,
  VulnActive,
  WebContent,
  WebDeep,
  WebEnrich,
  WebFingerprint,
  WebQuick,
};

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
  WebContent,
  OsintPassive,
  WebFingerprint,
  OsintPassiveDeep,
  WebEnrich,
  ServiceRecon,
  VulnActive,
];
