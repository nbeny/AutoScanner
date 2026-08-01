export type ThreatSignalSeverity = 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type ThreatSignalKind =
  | 'IP_REPUTATION'
  | 'EXPLOIT_AVAILABLE'
  | 'ACTIVE_EXPLOITATION'
  | 'KEV'
  | 'LEAK';

export interface ThreatSignal {
  indicator: string;
  kind: ThreatSignalKind;
  source: string;
  severity: ThreatSignalSeverity;
  payload?: Record<string, unknown>;
}

export interface ThreatLookupInput {
  cveId?: string | null;
  assetValue?: string | null;
}

/**
 * A pluggable threat-intelligence provider. Each source is blind to the others and returns zero
 * or more signals for a finding. New sources (GreyNoise, Shodan, MISP, VirusTotal — behind the
 * existing SecretBox credential model) implement this interface and are added to the service's
 * source list without touching the consumer.
 */
export interface ThreatIntelSource {
  readonly name: string;
  lookup(input: ThreatLookupInput): Promise<ThreatSignal[]>;
}

export const THREAT_INTEL_SOURCES = Symbol('THREAT_INTEL_SOURCES');
