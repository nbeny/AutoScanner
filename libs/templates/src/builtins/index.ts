import type { TemplateDefinition } from '../types';
import { OsintPassive } from './osint-passive';
import { OsintPassiveDeep } from './osint-passive-deep';
import { IdentityOsint } from './identity-osint';
import { ReconActive } from './recon-active';
import { ReconPassive } from './recon-passive';
import { ReconPassiveDeep } from './recon-passive-deep';
import { ServiceRecon } from './service-recon';
import { NetworkVuln } from './network-vuln';
import { VulnActive } from './vuln-active';
import { WebContent } from './web-content';
import { WebDeep } from './web-deep';
import { WebDeepActiveInjection } from './web-deep-active-injection';
import { WebCrawlDeep } from './web-crawl-deep';
import { WebEnrich } from './web-enrich';
import { WebFingerprint } from './web-fingerprint';
import { WebQuick } from './web-quick';
import { WebAppAudit } from './web-app-audit';
import { ActiveDirectoryRecon } from './active-directory-recon';
import { K8sRecon } from './k8s-recon';
import { CloudExposure } from './cloud-exposure';
import { IpActiveAudit } from './ip-active-audit';
import { IpPassiveIntel } from './ip-passive-intel';
import { IpReconFull } from './ip-recon-full';

export {
  ActiveDirectoryRecon,
  CloudExposure,
  IdentityOsint,
  IpActiveAudit,
  IpPassiveIntel,
  IpReconFull,
  K8sRecon,
  NetworkVuln,
  OsintPassive,
  OsintPassiveDeep,
  ReconActive,
  ReconPassive,
  ReconPassiveDeep,
  ServiceRecon,
  VulnActive,
  WebAppAudit,
  WebContent,
  WebCrawlDeep,
  WebDeep,
  WebDeepActiveInjection,
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
  WebDeepActiveInjection,
  WebContent,
  OsintPassive,
  WebFingerprint,
  OsintPassiveDeep,
  WebEnrich,
  ServiceRecon,
  VulnActive,
  NetworkVuln,
  WebAppAudit,
  ActiveDirectoryRecon,
  K8sRecon,
  CloudExposure,
  IpPassiveIntel,
  IpActiveAudit,
  IpReconFull,
  IdentityOsint,
  WebCrawlDeep,
];
