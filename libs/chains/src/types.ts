/** Entités qu'une chaîne peut produire (descripteur de capacité). */
export type EntityKind =
  | 'subdomains'
  | 'ipAddresses'
  | 'urls'
  | 'endpoints'
  | 'emails'
  | 'technologies'
  | 'findings'
  | 'vulnerabilities'
  | 'ports';

/** Chemins de contexte résolvables en cibles / inputs. */
export type ContextPath = 'target' | 'subdomains' | 'ipAddresses' | 'urls' | 'endpoints' | 'emails';

export type Severity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

/**
 * Capacités natives versionnées (aucune valeur fournie par l'utilisateur —
 * spec §7bis). La portée (guard/filter) est déclarée par le catalogue du
 * moteur, pas ici.
 */
export type Predicate =
  | { pred: 'httpDetected' }
  | { pred: 'hasOpenPort'; port: number }
  | { pred: 'techPresent'; name: string }
  | { pred: 'notBehindCdn' }
  | { pred: 'behindCdn' }
  | { pred: 'statusIn'; codes: number[] }
  | { pred: 'hasFindingSeverity'; atLeast: Severity }
  | { pred: 'scannerRan'; name: string }
  | { pred: 'scannerNotRun'; name: string };

export type InputRef = { kind: 'static'; value: unknown } | { kind: 'context'; path: ContextPath };

export interface TargetSelector {
  from: ContextPath;
  /** Chaque cible candidate doit passer TOUS les filtres pour être gardée. */
  filter?: Predicate[];
}

export interface ChainStep {
  /** Id stable — devient `AiRunNode.stepId` côté worker (idempotence). */
  id: string;
  scannerName: string;
  target: TargetSelector;
  /** TOUS vrais sinon le step est SKIPPED (tracé, pas échoué). */
  when?: Predicate[];
  inputs?: Record<string, InputRef>;
  requiresCapability?: string;
}

/** Guardrails (miroir local du type worker, gardé pur ici). */
export interface ChainGuardrails {
  maxScans: number;
  maxDepth: number;
  timeBudgetMs: number;
  hostCap: number;
}

export interface ChainDefinition {
  name: string;
  displayName: string;
  description: string;
  /** Bump si la sémantique de la chaîne change (spec §7bis). */
  version: string;
  // --- descripteur de capacité (spec §7) ---
  whenToUse: string;
  requiredInputs?: string[];
  produces: EntityKind[];
  // --- exécution ---
  defaultGuardrails?: Partial<ChainGuardrails>;
  scopeAcknowledgement?: string;
  steps: ChainStep[];
}
