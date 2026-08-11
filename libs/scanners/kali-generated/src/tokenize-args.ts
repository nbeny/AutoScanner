/**
 * Split a freeform argv string into tokens without invoking a shell.
 * Honors single and double quotes; collapses surrounding whitespace.
 */
export function tokenizeArgs(raw: string | undefined): string[] {
  if (!raw) return [];
  const pattern = /"([^"]*)"|'([^']*)'|(\S+)/g;
  const tokens: string[] = [];
  for (const match of raw.matchAll(pattern)) {
    tokens.push(match[1] ?? match[2] ?? match[3] ?? '');
  }
  return tokens;
}
