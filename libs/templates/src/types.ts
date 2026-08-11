/**
 * A single step in a linear template playlist (SP3a).
 *
 * Since SP1 every scanner is a generic raw Kali tool with input
 * `{ target?, args?, preset? }`. A template step therefore only needs to name a
 * binary and the CLI flags to run it with; the run's root target is used for
 * every step (no discovery fan-out). Place the literal `{{target}}` token inside
 * `args` when the tool needs the target mid-command (e.g. `nikto -host {{target}}`);
 * otherwise the target is auto-appended by the generic scanner `build()`.
 */
export interface TemplateStep {
  scannerName: string;
  /** Raw CLI flags passed to the generic Kali scanner (a single string). */
  args?: string;
  /** Optional named preset understood by the scanner. */
  preset?: string;
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
