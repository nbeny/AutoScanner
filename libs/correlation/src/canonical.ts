import ipaddr from 'ipaddr.js';
// Use the userland `punycode/` package (trailing slash) to avoid Node's
// deprecated built-in `punycode` module. `@types/punycode` ships the type
// declarations; we re-import them via a `typeof` indirection because the
// trailing-slash module specifier has no own .d.ts.
// eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
const punycode: typeof import('punycode') = require('punycode/');

export interface CanonicalizeOptions {
  type: 'DOMAIN' | 'SUBDOMAIN' | 'IP_ADDRESS';
}

/**
 * Canonicalize a domain or subdomain value.
 *
 * - Trim whitespace.
 * - Lowercase.
 * - Strip trailing FQDN-root dot.
 * - If the result contains non-ASCII characters or any label starts with
 *   `xn--`, convert via `punycode.toASCII` so IDN inputs become canonical
 *   ASCII (e.g. `bücher.example` → `xn--bcher-kva.example`).
 *
 * Idempotent: `canonicalDomain(canonicalDomain(x)) === canonicalDomain(x)`.
 */
export function canonicalDomain(value: string): string {
  const lowered = value.trim().toLowerCase().replace(/\.$/, '');
  // `punycode.toASCII` is a no-op for pure-ASCII inputs that don't already
  // contain IDN-encoded labels, so calling it unconditionally is safe and
  // keeps idempotence trivial. Wrap in try/catch in case `punycode` rejects
  // an exotic input — fall back to the lowered form rather than throwing,
  // since callers (persisters) assume non-throwing canonicalisation.
  try {
    return punycode.toASCII(lowered);
  } catch {
    return lowered;
  }
}

/**
 * Canonicalize an IP address value.
 *
 * - Trim whitespace.
 * - Parse via `ipaddr.js`. IPv4 uses the normalized dotted form;
 *   IPv6 uses RFC 5952 compression (e.g. `2001:0db8:0000::0001` →
 *   `2001:db8::1`, `2001:DB8::1` → `2001:db8::1`).
 * - If parse fails (malformed input), fall back to `value.trim().toLowerCase()`
 *   so the caller invariant of non-throwing canonicalisation holds.
 *
 * Idempotent: `canonicalIp(canonicalIp(x)) === canonicalIp(x)`.
 */
export function canonicalIp(value: string): string {
  const trimmed = value.trim();
  try {
    const parsed = ipaddr.parse(trimmed);
    if (parsed.kind() === 'ipv6') {
      return (parsed as ipaddr.IPv6).toRFC5952String();
    }
    return (parsed as ipaddr.IPv4).toNormalizedString();
  } catch {
    return trimmed.toLowerCase();
  }
}

/**
 * Legacy canonicalize entry point — single source of truth for canonicalising
 * host-like values on the persister side. Kept for backward compatibility
 * with the 5 call-sites in parser-worker that resolve `{ type }` dynamically.
 *
 * - DOMAIN/SUBDOMAIN → delegates to {@link canonicalDomain}.
 * - IP_ADDRESS → delegates to {@link canonicalIp}.
 * - default → `value.trim()` (URL, NETWORK, EMAIL etc.).
 */
export function canonicalize(value: string, opts: CanonicalizeOptions): string {
  if (opts.type === 'DOMAIN' || opts.type === 'SUBDOMAIN') {
    return canonicalDomain(value);
  }
  if (opts.type === 'IP_ADDRESS') {
    return canonicalIp(value);
  }
  return value.trim();
}
