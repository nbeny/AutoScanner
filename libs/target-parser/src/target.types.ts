export type TargetKind =
  | 'ipv4'
  | 'ipv6'
  | 'ipv4-cidr'
  | 'ipv6-cidr'
  | 'ipv4-range'
  | 'ipv6-range'
  | 'invalid';

export type ScanStrategy = 'SINGLE_HOST' | 'RANGE_PER_HOST' | 'RANGE_AGGREGATE';

export interface ParsedTarget {
  raw: string;
  kind: TargetKind;
  normalized: string;
  strategy: ScanStrategy;
}
