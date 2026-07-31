/** Action unitaire décidée pour un round : lancer un scan, ou skip tracé. */
export type DecisionAction =
  | {
      kind: 'run';
      scannerName: string;
      target: string;
      inputs: Record<string, unknown>;
      stepId?: string; // renseigné pour les chaînes (idempotence)
      rationale: string;
    }
  | {
      kind: 'skip';
      scannerName: string;
      target: string;
      stepId?: string;
      skipReason: string;
    };

/** Résultat unifié d'un round de décision (IA ou chaîne). */
export interface DecisionOutcome {
  done: boolean;
  actions: DecisionAction[];
  degraded?: boolean;
  /** Snapshot persisté dans AiDecision.responseJson (trace / audit). */
  snapshot?: unknown;
}

export interface DecideArgs {
  aiRunId: string;
  engagementId: string;
  host: string;
  chainName?: string | null;
  budgetRemaining: { scans: number; depth: number };
}

export interface AuditArgs {
  aiRunId: string;
  target: string;
}

/**
 * Frontière de décision de la boucle : la même boucle pilote un décideur IA
 * (`ClaudeDecider`) ou déterministe (`ChainDecider`) sans savoir lequel.
 */
export interface NextStepDecider {
  decide(args: DecideArgs): Promise<DecisionOutcome>;
  audit(args: AuditArgs): Promise<string>;
}
