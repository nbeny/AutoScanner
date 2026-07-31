export interface AiRunNode {
  id: string;
  parentNodeId: string | null;
  scanId: string | null;
  scannerName: string;
  target: string;
  depth: number;
  rationale: string | null;
  status: string;
  createdAt: string;
  stepId?: string | null;
  skipReason?: string | null;
}

export interface AiDecision {
  id: string;
  round: number;
  degraded: boolean;
  createdAt: string;
}

export interface AiRun {
  id: string;
  target: string;
  strategy: string;
  status: string;
  scanCount: number;
  currentDepth: number;
  degraded: boolean;
  auditText: string | null;
  errorMessage: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  nodes: AiRunNode[];
  decisions: AiDecision[];
}

export interface Guardrails {
  maxScans: number;
  maxDepth: number;
  timeBudgetMs: number;
  hostCap: number;
}

export const DEFAULT_GUARDRAILS: Guardrails = {
  maxScans: 200,
  maxDepth: 8,
  timeBudgetMs: 3600000,
  hostCap: 16,
};
