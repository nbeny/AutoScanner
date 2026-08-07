// apps/frontend/src/features/runner/tokenize-args.ts
/**
 * Split a free-text args string into an argv array. Whitespace-separated, with
 * "double" or 'single' quoted spans kept as one token (quotes stripped). This is
 * a UI convenience — the server receives a plain argv array and never runs a
 * shell, so this is intentionally NOT a full shell parser.
 */
export function tokenizeArgs(input: string): string[] {
  const out: string[] = [];
  for (const m of input.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)) {
    out.push(m[1] ?? m[2] ?? m[3] ?? '');
  }
  return out;
}
