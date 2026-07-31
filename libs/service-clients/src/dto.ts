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
