import type { ScannerRegistry } from '@autoscanner/scanner-sdk';

/**
 * A single scanner Claude proposes to run next. `inputs` is validated against
 * the scanner's own Zod `inputSchema` before it is trusted.
 */
export interface ProposedScan {
  scannerName: string;
  target: string;
  inputs: Record<string, unknown>;
  why: string;
}

/**
 * The sanitised decision handed back to the orchestration loop. `next` only
 * ever contains scans that reference a real scanner with schema-valid inputs.
 */
export interface ValidatedDecision {
  done: boolean;
  rationale: string;
  next: ProposedScan[];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

/**
 * Coerce and validate the raw (untrusted) LLM decision. Never throws: garbage
 * input degrades to a safe `{ done: false, rationale: '', next: [] }`. Each
 * proposed scan survives only if it names a registered scanner, carries a
 * non-empty string target, and its inputs pass the scanner's `inputSchema`.
 */
export function validateDecision(raw: unknown, registry: ScannerRegistry): ValidatedDecision {
  const obj = asRecord(raw);

  const done = obj.done === true;
  const rationale = typeof obj.rationale === 'string' ? obj.rationale : '';
  const rawNext = Array.isArray(obj.next) ? obj.next : [];

  const next: ProposedScan[] = [];
  for (const candidate of rawNext) {
    const c = asRecord(candidate);
    const scannerName = c.scannerName;
    const target = c.target;

    if (typeof scannerName !== 'string' || !registry.has(scannerName)) continue;
    if (typeof target !== 'string' || target.length === 0) continue;

    const inputs = asRecord(c.inputs);
    const def = registry.get(scannerName);
    if (!def.inputSchema.safeParse(inputs).success) continue;

    next.push({
      scannerName,
      target,
      inputs,
      why: typeof c.why === 'string' ? c.why : '',
    });
  }

  return { done, rationale, next };
}
