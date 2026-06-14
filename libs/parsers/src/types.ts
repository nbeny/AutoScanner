import type { RawOutputFormat } from '@autoscanner/scanner-sdk';

export type Severity = 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type AssetType = 'IP' | 'DOMAIN' | 'SUBDOMAIN' | 'URL' | 'NETBLOCK' | 'EMAIL';
export type Protocol = 'TCP' | 'UDP' | 'ICMP' | 'SCTP';
export type PortState = 'OPEN' | 'CLOSED' | 'FILTERED' | 'OPEN_FILTERED' | 'UNFILTERED';

export interface NormalizedAsset {
  type: AssetType;
  value: string;
  hostnames?: string[];
}

export interface NormalizedPort {
  assetValue: string;
  number: number;
  protocol: Protocol;
  state: PortState;
  reason?: string;
}

export interface NormalizedService {
  assetValue: string;
  portNumber: number;
  protocol: Protocol;
  name?: string;
  product?: string;
  version?: string;
  extraInfo?: string;
  cpe?: string[];
  confidence?: number;
}

export interface NormalizedTechnology {
  assetValue: string;
  name: string;
  version?: string;
  categories?: string[];
}

export interface NormalizedDnsRecord {
  assetValue: string;
  recordType: string;
  value: string;
  ttl?: number;
}

export interface NormalizedFinding {
  scannerName: string;
  title: string;
  severity: Severity;
  location?: string;
  cveId?: string;
  templateId?: string;
  evidence?: unknown;
  description?: string;
}

export interface NormalizedCredential {
  assetValue: string;
  service?: string;
  username?: string;
  password?: string;
  evidence?: unknown;
}

export interface NormalizedHttpProbe {
  assetValue: string; // host (matches SUBDOMAIN asset value)
  status?: number;
  title?: string;
  server?: string;
}

export interface NormalizedEndpoint {
  url: string;
  method?: string;
  statusCode?: number;
  contentLength?: number;
}

export interface NormalizedEmail {
  address: string;
  source?: string;
}

export interface NormalizedOrgMetadata {
  kind: 'WHOIS' | 'ASN' | 'ORG' | 'NETBLOCK' | 'CLOUD_BUCKET' | 'OTHER';
  data: unknown;
}

export interface NormalizedTlsCertificate {
  host: string;
  subjectCn?: string;
  subjectAn?: string[];
  issuerCn?: string;
  notBefore?: string;
  notAfter?: string;
  fingerprintSha256: string;
  tlsVersion?: string;
  selfSigned?: boolean;
  expired?: boolean;
}

export interface NormalizedOutput {
  assets: NormalizedAsset[];
  ports: NormalizedPort[];
  services: NormalizedService[];
  technologies: NormalizedTechnology[];
  dnsRecords: NormalizedDnsRecord[];
  findings: NormalizedFinding[];
  credentials: NormalizedCredential[];
  httpProbes: NormalizedHttpProbe[];
  endpoints: NormalizedEndpoint[];
  emails: NormalizedEmail[];
  orgMetadata: NormalizedOrgMetadata[];
  tlsCertificates: NormalizedTlsCertificate[];
  raw?: unknown;
}

export interface ParserContext {
  scanJobId: string;
  scannerName: string;
  target: string;
  engagementId: string;
}

export interface Parser<TInput = Buffer | string> {
  name: string;
  formats: RawOutputFormat[];
  parse(input: TInput, ctx: ParserContext): Promise<NormalizedOutput>;
}

export const PARSER_REGISTRY = Symbol('PARSER_REGISTRY');

export function emptyNormalizedOutput(): NormalizedOutput {
  return {
    assets: [],
    ports: [],
    services: [],
    technologies: [],
    dnsRecords: [],
    findings: [],
    credentials: [],
    httpProbes: [],
    endpoints: [],
    emails: [],
    orgMetadata: [],
    tlsCertificates: [],
  };
}
