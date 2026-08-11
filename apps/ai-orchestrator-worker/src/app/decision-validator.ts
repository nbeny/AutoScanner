import type { ScannerRegistry } from '@autoscanner/scanner-sdk';

/**
 * A single scanner Claude proposes to run next. `args` is the raw CLI flag
 * string handed verbatim to the generic Kali scanner (`{ args }`); the run
 * target is auto-appended (or substituted for a `{{target}}` placeholder).
 */
export interface ProposedScan {
  scannerName: string;
  target: string;
  args: string;
  preset?: string;
  why: string;
}

/**
 * The sanitised decision handed back to the orchestration loop. `next` only
 * ever contains scans that reference a real, registered scanner.
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
 * proposed scan survives only if it names a registered scanner and carries a
 * non-empty string target. Every generic Kali scanner accepts `{ args, preset }`,
 * so the args string is trusted through as-is (the scanner's `build()` tokenises
 * it) rather than validated against per-option keys.
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

    const args = typeof c.args === 'string' ? c.args : '';
    const def = registry.get(scannerName);
    const input: Record<string, unknown> = { args };
    if (typeof c.preset === 'string' && c.preset.length > 0) input.preset = c.preset;
    // Sanity guard: the generic schema accepts `{ args, preset }`; bail on the
    // (unexpected) scanner whose schema would reject it rather than dispatch junk.
    if (!def.inputSchema.safeParse(input).success) continue;

    next.push({
      scannerName,
      target,
      args,
      ...(typeof c.preset === 'string' && c.preset.length > 0 ? { preset: c.preset } : {}),
      why: typeof c.why === 'string' ? c.why : '',
    });
  }

  return { done, rationale, next };
}
