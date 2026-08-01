/** One normalized asset as emitted by a parser (pre-canonicalization). */
export interface ParseBatchAsset {
  type: string;
  value: string;
  httpProbe?: Record<string, unknown>;
}

export interface ParseBatchRequest {
  engagementId: string;
  scanJobId: string;
  scannerName: string;
  assets: ParseBatchAsset[];
  ports: Array<Record<string, unknown>>;
  services: Array<Record<string, unknown>>;
  technologies: Array<Record<string, unknown>>;
  /**
   * Observations that belong to an asset but are produced by discovery-side work
   * (DNS records, subdomain<->IP links). They travel here so `AssetObservation` stays a
   * single-writer table without losing the rows the pre-split parser wrote.
   */
  extraObservations?: Array<{
    assetValue: string;
    kind: string;
    payload?: Record<string, unknown>;
  }>;
}

export interface ParseBatchResponse {
  /** Canonical value -> Asset id, used by the caller to attach Findings without an N+1. */
  assetIdsByCanonicalValue: Record<string, string>;
  assetsPersisted: number;
  portsPersisted: number;
  servicesPersisted: number;
  technologiesPersisted: number;
  observationsPersisted: number;
}

/** discovery-service get-or-create for the Asset polymorphic pivot. */
export interface DiscoveryEntityRequest {
  engagementId: string;
  kind: 'DOMAIN' | 'SUBDOMAIN' | 'IP_ADDRESS';
  value: string;
  canonicalValue: string;
  /**
   * SUBDOMAIN only: the httpx probe fields that used to be patched onto the Subdomain row
   * by AssetPersister. Subdomain is discovery-owned, so the patch travels with the
   * get-or-create instead of being written across the service boundary.
   */
  httpProbe?: { status?: number; title?: string; server?: string };
}

export interface DiscoveryEntityResponse {
  id: string;
  kind: 'DOMAIN' | 'SUBDOMAIN' | 'IP_ADDRESS';
}

/** Shared scan context every discovery batch persister already expects. */
export interface DiscoveryBatchContext {
  engagementId: string;
  scanJobId: string;
  scannerName: string;
  target: string;
}

/**
 * Discovery-side counterpart of the asset parse-batch. The entity groups keep the exact
 * shapes the moved persisters already accept, so the move stayed mechanical.
 */
export interface DiscoveryParseBatchRequest extends DiscoveryBatchContext {
  dnsRecords: Array<Record<string, unknown>>;
  endpoints: Array<Record<string, unknown>>;
  emails: Array<Record<string, unknown>>;
  identities: Array<Record<string, unknown>>;
  breachExposures: Array<Record<string, unknown>>;
  orgMetadata: Array<Record<string, unknown>>;
  tlsCertificates: Array<Record<string, unknown>>;
  /**
   * Subdomain <-> IP links to materialise. discovery-service resolves both sides by
   * canonical value and skips pairs whose rows do not exist yet.
   */
  subdomainIpLinks: Array<{ canonicalHost: string; canonicalIp: string }>;
}

export interface DiscoveryParseBatchResponse {
  dnsRecordsPersisted: number;
  endpointsPersisted: number;
  emailsPersisted: number;
  identitiesPersisted: number;
  breachExposuresPersisted: number;
  orgMetadataPersisted: number;
  tlsCertificatesPersisted: number;
  subdomainIpsPersisted: number;
  /** Links actually created, so the caller can record the matching asset observations. */
  linkedHosts: string[];
}

export interface FindingBatchItem {
  assetId: string;
  assetCanonical: string;
  scannerName: string;
  title: string;
  severity: string;
  location?: string;
  cveId?: string;
  templateId?: string;
  evidence?: Record<string, unknown>;
}

export interface FindingBatchRequest {
  engagementId: string;
  scanJobId: string;
  scannerName: string;
  findings: FindingBatchItem[];
}

export interface FindingBatchResponse {
  findingsPersisted: number;
  /** Assets touched, so the caller can trigger one risk recompute per asset. */
  affectedAssetIds: string[];
  /** FINDING_RAISED observations for asset-service to write (it owns AssetObservation). */
  observations: Array<{ assetId: string; kind: string; payload: Record<string, unknown> }>;
}

export interface TriageRequest {
  correlatedFindingId: string;
  status: string;
  actorId: string;
  note?: string;
}
