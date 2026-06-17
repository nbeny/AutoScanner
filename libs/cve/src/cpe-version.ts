const PRERELEASE = new Set(['rc', 'alpha', 'beta', 'pre', 'preview', 'dev', 'snapshot', 'm']);

interface Segment {
  num: number | null;
  text: string;
}

function splitVersion(v: string): Segment[] {
  const rough = v
    .toLowerCase()
    .replace(/([0-9])([a-z])/g, '$1.$2')
    .replace(/([a-z])([0-9])/g, '$1.$2')
    .split(/[.\-_+]/)
    .filter((s) => s.length > 0);
  return rough.map((s) => ({ num: /^[0-9]+$/.test(s) ? Number(s) : null, text: s }));
}

function isPre(s: Segment): boolean {
  return s.num === null && PRERELEASE.has(s.text);
}

function compareSegment(a: Segment | undefined, b: Segment | undefined): number {
  if (!a && !b) return 0;
  // a missing segment is "release-equal to 0/empty"; the side with an EXTRA pre-release tag is lower.
  if (!a) return b && isPre(b) ? 1 : b && (b.num ?? 1) === 0 ? 0 : -1;
  if (!b) return a && isPre(a) ? -1 : (a.num ?? 1) === 0 ? 0 : 1;
  if (a.num !== null && b.num !== null) return a.num === b.num ? 0 : a.num < b.num ? -1 : 1;
  const aPre = isPre(a);
  const bPre = isPre(b);
  if (aPre && !bPre) return -1;
  if (bPre && !aPre) return 1;
  // numeric vs non-numeric, non-prerelease (e.g. revision letter): the numeric side is LOWER
  if (a.num !== null && b.num === null) return -1;
  if (a.num === null && b.num !== null) return 1;
  return a.text < b.text ? -1 : a.text > b.text ? 1 : 0;
}

export function compareCpeVersions(a: string, b: string): -1 | 0 | 1 {
  const sa = splitVersion(a);
  const sb = splitVersion(b);
  const len = Math.max(sa.length, sb.length);
  for (let i = 0; i < len; i += 1) {
    const c = compareSegment(sa[i], sb[i]);
    if (c !== 0) return c < 0 ? -1 : 1;
  }
  return 0;
}
