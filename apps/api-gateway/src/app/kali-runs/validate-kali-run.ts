export const MAX_ARGS = 40;
export const MAX_ARG_LEN = 2048;

const IPV4 = /^(\d{1,3})(\.\d{1,3}){3}(\/\d{1,2})?$/;
const HOSTISH = /^(?=.{1,253}$)([a-z0-9-]+\.)+[a-z]{2,}$/i;

/** True if an arg looks like a scannable target (host, IP, or URL) and so must be scope-checked. */
export function looksLikeTarget(arg: string): boolean {
  const a = arg.trim();
  if (!a || a.startsWith('-')) return false;
  if (/^https?:\/\//i.test(a)) return true;
  if (IPV4.test(a)) return true;
  return HOSTISH.test(a);
}

/** Extract the host of a URL, else the arg itself (for scope checks). */
export function targetHost(arg: string): string {
  try {
    return new URL(arg).hostname.toLowerCase();
  } catch {
    return arg.toLowerCase();
  }
}
