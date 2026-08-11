import type { TemplateDefinition } from '../types';
import { ReconPassif } from './recon-passif';
import { ReconDomaine } from './recon-domaine';
import { WebSurface } from './web-surface';
import { WebContenu } from './web-contenu';
import { Tls } from './tls';
import { Reseau } from './reseau';
import { SmbWindows } from './smb-windows';
import { Snmp } from './snmp';

export { ReconPassif, ReconDomaine, WebSurface, WebContenu, Tls, Reseau, SmbWindows, Snmp };

/**
 * Source unique de vérité pour les templates intégrés (SP3a). Depuis SP1 chaque
 * scanner est un outil Kali brut générique; un template est donc une *playlist*
 * linéaire d'outils exécutés sur la cible racine avec des `args`. Consommée par
 * `TemplatesModule.onModuleInit` (registre runtime) et par `prisma/seed.ts`
 * (rangées `ScanTemplate` initiales en base).
 */
export const BUILTIN_TEMPLATES: readonly TemplateDefinition[] = [
  ReconPassif,
  ReconDomaine,
  WebSurface,
  WebContenu,
  Tls,
  Reseau,
  SmbWindows,
  Snmp,
];
