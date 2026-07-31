export interface PredicateEval {
  pred: string;
  version: string;
  args?: Record<string, unknown>;
  scope: 'guard' | 'filter';
  /** Pour un filter : la cible candidate évaluée. */
  target?: string;
  expected: unknown;
  actual: unknown;
  passed: boolean;
}

export interface StepEvaluation {
  stepId: string;
  scannerName: string;
  gate: { passed: boolean; predicates: PredicateEval[] };
  targets: { value: string; keep: boolean; filters: PredicateEval[] }[];
  /** Verdict du MOTEUR (pas l'action métier du worker). */
  action: 'run' | 'skip';
  skipReason?: string;
}

export interface EvaluationResult {
  done: boolean;
  next?: StepEvaluation;
  catalogVersion: string;
}

/** Entrée de `buildAudit` : trace + compteurs de découverte (fournis par le worker). */
export interface AuditInput {
  chainDisplayName: string;
  target: string;
  steps: StepEvaluation[];
  discovered: {
    ipAddresses: number;
    technologies: string[];
    endpoints: number;
    findings: { total: number; bySeverity: Record<string, number> };
  };
}
