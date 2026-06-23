import type { AuthConfig } from './types';

/**
 * Renders an {@link AuthConfig} into a flat list of HTTP header lines
 * (`"Name: Value"`), with the cookie expressed as a `Cookie:` header so every
 * web tool can consume the same uniform shape via its repeatable header flag
 * (nuclei/katana/sqlmap/SSTImap all accept `-H "Name: Value"`).
 *
 * Returns an empty array when no auth is configured, so callers can splice the
 * result in unconditionally and produce an identical command when unauthenticated.
 */
export function authHeaderLines(auth?: AuthConfig): string[] {
  if (!auth) return [];
  const lines: string[] = [];
  if (auth.cookie && auth.cookie.length > 0) lines.push(`Cookie: ${auth.cookie}`);
  for (const [name, value] of Object.entries(auth.headers ?? {})) {
    if (name.length > 0) lines.push(`${name}: ${value}`);
  }
  return lines;
}
