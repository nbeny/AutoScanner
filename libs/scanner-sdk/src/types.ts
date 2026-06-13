import type { z } from 'zod';

export enum ScannerCategory {
  NETWORK_DISCOVERY = 'network-discovery',
  PORT_SCAN = 'port-scan',
  SERVICE_DETECTION = 'service-detection',
  DNS = 'dns',
  SUBDOMAIN_ENUM = 'subdomain-enum',
  WEB_FINGERPRINT = 'web-fingerprint',
  WEB_ENUM = 'web-enum',
  VULN_SCAN = 'vuln-scan',
  SSL_TLS = 'ssl-tls',
  SMB_WINDOWS = 'smb-windows',
  ACTIVE_DIRECTORY = 'active-directory',
  CLOUD = 'cloud',
  CONTAINER_K8S = 'container-k8s',
  WIFI = 'wifi',
  NETWORK_ANALYSIS = 'network-analysis',
  PASSWORD = 'password',
  OSINT = 'osint',
  PASSIVE_RECON = 'passive-recon',
  API_SECURITY = 'api-security',
  SMTP = 'smtp',
  SNMP = 'snmp',
  IOT_ICS = 'iot-ics',
  IMPORT_ONLY = 'import-only',
}

export type RawOutputFormat =
  | 'XML'
  | 'JSON'
  | 'JSONL'
  | 'CSV'
  | 'TEXT'
  | 'HTML'
  | 'SARIF'
  | 'PCAP'
  | 'BINARY';

export type ProducedEntity =
  | 'Asset'
  | 'Subdomain'
  | 'Domain'
  | 'IpAddress'
  | 'Port'
  | 'Service'
  | 'Technology'
  | 'Finding'
  | 'Credential'
  | 'DnsRecord'
  | 'Endpoint'
  | 'Email'
  | 'OrgMetadata'
  | 'TlsCertificate';

export interface BuildContext {
  scanJobId: string;
  engagementId: string;
  scratchDir: string;
}

export interface BuildResult {
  cmd: string[];
  env?: Record<string, string>;
  binds?: Array<{ src: string; dst: string; readonly?: boolean }>;
  stdin?: string;
}

export interface ScannerOutput {
  format: RawOutputFormat;
  capture: 'stdout' | 'stderr' | { path: string };
  parser: string;
}

export interface ScannerDockerSpec {
  image: string;
  fallbackImage?: string;
  network: 'bridge' | 'host' | 'none';
  capabilities: string[];
  readonlyRootfs: boolean;
  memoryLimitMb: number;
  cpuQuota: number;
  defaultTimeoutMs: number;
}

export interface ScannerDefinition<TInput = unknown, _TRawOutput = unknown> {
  name: string;
  displayName: string;
  category: ScannerCategory[];
  description: string;
  version?: string;
  inputSchema: z.ZodType<TInput, z.ZodTypeDef, unknown>;
  docker: ScannerDockerSpec;
  build(input: TInput, target: string, ctx: BuildContext): BuildResult;
  outputs: ScannerOutput[];
  produces: ProducedEntity[];
  /** If set, scan-worker resolves the operator's encrypted API key for this provider and injects it. */
  requiresCredential?: 'SHODAN' | 'CENSYS';
  /** Env var name to inject the decrypted credential into (e.g. 'SHODAN_API_KEY'). */
  credentialEnvVar?: string;
}

export const SCANNER_REGISTRY = Symbol('SCANNER_REGISTRY');
