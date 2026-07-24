import ipaddr from 'ipaddr.js';
import type { ParsedTarget, TargetKind, ScanStrategy } from './target.types';

function strategyFor(kind: TargetKind): ScanStrategy {
  if (kind === 'ipv4' || kind === 'ipv6') return 'SINGLE_HOST';
  return 'RANGE_PER_HOST';
}

function isIp(s: string, v: 4 | 6): boolean {
  try {
    return ipaddr.parse(s).kind() === (v === 4 ? 'ipv4' : 'ipv6');
  } catch {
    return false;
  }
}

function isCidr(s: string, v: 4 | 6): boolean {
  try {
    const [addr] = ipaddr.parseCIDR(s);
    return addr.kind() === (v === 4 ? 'ipv4' : 'ipv6');
  } catch {
    return false;
  }
}

export function parseTarget(raw: string): ParsedTarget {
  const t = (raw ?? '').trim();
  let kind: TargetKind = 'invalid';
  if (isIp(t, 4)) kind = 'ipv4';
  else if (isIp(t, 6)) kind = 'ipv6';
  else if (isCidr(t, 4)) kind = 'ipv4-cidr';
  else if (isCidr(t, 6)) kind = 'ipv6-cidr';
  else if (/^\S+-\S+$/.test(t)) {
    const [a, b] = t.split('-');
    if (isIp(a, 4) && isIp(b, 4)) kind = 'ipv4-range';
    else if (isIp(a, 6) && isIp(b, 6)) kind = 'ipv6-range';
  }
  return { raw, kind, normalized: t, strategy: strategyFor(kind) };
}
