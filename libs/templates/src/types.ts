export type ContextRef =
  | { kind: 'static'; value: unknown }
  | { kind: 'context'; path: 'subdomains' | 'urls' | 'ipAddresses' | 'endpoints' | 'target' };

export interface TemplateStep {
  scannerName: string;
  /** Inputs passés au scanner. Les valeurs peuvent référencer le contexte. */
  inputs: Record<string, ContextRef>;
  /** Comment construire la liste de targets de ce step. */
  target: ContextRef;
  /** When set, step is skipped (not failed) if the caller lacks the capability. */
  requiresCapability?: string;
}

export interface TemplateDefinition {
  name: string;
  displayName: string;
  description: string;
  steps: TemplateStep[];
  /** Banner shown in the template form; the operator must tick acknowledgement before scheduling. */
  scopeAcknowledgement?: string;
}
