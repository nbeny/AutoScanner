import type { GraphQLClient } from 'graphql-request';
import type { Asset, AssetDetail, CveInfo, DnsRecord, Finding, Scan, TemplateRun } from './types';

/** Fetches assets with ports + technologies — the fat shape used by recon specs. */
export async function queryAssetsFull(gql: GraphQLClient, engagementId: string): Promise<Asset[]> {
  const res = await gql.request<{ assets: Asset[] }>(
    /* GraphQL */ `
      query A($engagementId: ID!) {
        assets(engagementId: $engagementId) {
          id
          type
          value
          canonicalValue
          lastSeenAt
          ports {
            id
            number
            protocol
            state
          }
          technologies {
            id
            name
          }
        }
      }
    `,
    { engagementId },
  );
  return res.assets;
}

/** Lean variant used by first-scan-e2e — drops technologies, keeps services. */
export async function queryAssetsWithServices(
  gql: GraphQLClient,
  engagementId: string,
): Promise<Asset[]> {
  const res = await gql.request<{ assets: Asset[] }>(
    /* GraphQL */ `
      query A($engagementId: ID!) {
        assets(engagementId: $engagementId) {
          id
          value
          type
          ports {
            number
            protocol
            state
            services {
              name
            }
          }
        }
      }
    `,
    { engagementId },
  );
  return res.assets;
}

export function filterAssetsByType(assets: Asset[], type: string): Asset[] {
  return assets.filter((a) => a.type === type);
}

export async function queryDnsRecords(
  gql: GraphQLClient,
  engagementId: string,
): Promise<DnsRecord[]> {
  const res = await gql.request<{ dnsRecords: DnsRecord[] }>(
    /* GraphQL */ `
      query D($engagementId: ID!) {
        dnsRecords(engagementId: $engagementId) {
          id
          type
          name
          value
          firstSeenAt
          lastSeenAt
        }
      }
    `,
    { engagementId },
  );
  return res.dnsRecords;
}

export async function queryFindings(gql: GraphQLClient, engagementId: string): Promise<Finding[]> {
  const res = await gql.request<{ findings: Finding[] }>(
    /* GraphQL */ `
      query F($engagementId: ID!) {
        findings(engagementId: $engagementId) {
          id
          title
          severity
          cveId
        }
      }
    `,
    { engagementId },
  );
  return res.findings;
}

export async function queryAssetDetailWithObservations(
  gql: GraphQLClient,
  id: string,
): Promise<AssetDetail> {
  const res = await gql.request<{ assetDetail: AssetDetail }>(
    /* GraphQL */ `
      query AD($id: ID!) {
        assetDetail(id: $id) {
          id
          kind
          canonicalValue
          observations {
            id
            kind
            scannerName
            ts
          }
        }
      }
    `,
    { id },
  );
  return res.assetDetail;
}

export async function queryCveInfo(gql: GraphQLClient, cveId: string): Promise<CveInfo> {
  const res = await gql.request<{ cveInfo: CveInfo }>(
    /* GraphQL */ `
      query CI($cveId: String!) {
        cveInfo(cveId: $cveId) {
          cveId
          cached
          cvssV3Score
          cvssV3Vector
          severity
          summary
          fetchStatus
        }
      }
    `,
    { cveId },
  );
  return res.cveInfo;
}

export async function queryScan(gql: GraphQLClient, id: string): Promise<Scan> {
  const res = await gql.request<{ scan: Scan }>(
    /* GraphQL */ `
      query S($id: ID!) {
        scan(id: $id) {
          id
          status
          completedAt
          jobs {
            id
            scannerName
            target
            status
            rawOutputKey
          }
        }
      }
    `,
    { id },
  );
  return res.scan;
}

export interface RunScanInput {
  engagementId: string;
  scannerName: string;
  target: string;
  optionsJson?: string;
}

export async function runScan(gql: GraphQLClient, input: RunScanInput): Promise<Scan> {
  const res = await gql.request<{ runScan: Scan }>(
    /* GraphQL */ `
      mutation Run($input: RunScanInput!) {
        runScan(input: $input) {
          id
          status
          jobs {
            id
            scannerName
            target
            status
          }
        }
      }
    `,
    { input },
  );
  return res.runScan;
}

export interface RunTemplateInput {
  engagementId: string;
  templateName: string;
  target: string;
}

export async function runTemplate(
  gql: GraphQLClient,
  input: RunTemplateInput,
): Promise<TemplateRun> {
  const res = await gql.request<{ runTemplate: TemplateRun }>(
    /* GraphQL */ `
      mutation Run($input: RunTemplateInput!) {
        runTemplate(input: $input) {
          id
          status
        }
      }
    `,
    { input },
  );
  return res.runTemplate;
}

export function totalPorts(assets: Asset[]): number {
  return assets.reduce((sum, a) => sum + (a.ports?.length ?? 0), 0);
}

export function totalTechnologies(assets: Asset[]): number {
  return assets.reduce((sum, a) => sum + (a.technologies?.length ?? 0), 0);
}

/** Endpoints for an engagement (Phase 6.2). */
export async function endpointsByEngagement(
  gql: GraphQLClient,
  engagementId: string,
): Promise<Array<{ id: string; url: string; method: string; source: string; lastSeenAt: string }>> {
  const query = /* GraphQL */ `
    query Endpoints($engagementId: ID!) {
      endpoints(engagementId: $engagementId) {
        id
        url
        method
        source
        lastSeenAt
      }
    }
  `;
  const data = await gql.request<{
    endpoints: Array<{
      id: string;
      url: string;
      method: string;
      source: string;
      lastSeenAt: string;
    }>;
  }>(query, { engagementId });
  return data.endpoints;
}

/** Org metadata for an engagement (Phase 6.3). */
export async function orgMetadataByEngagement(
  gql: GraphQLClient,
  engagementId: string,
): Promise<Array<{ id: string; kind: string; source: string }>> {
  const query = /* GraphQL */ `
    query OrgMeta($engagementId: ID!) {
      orgMetadata(engagementId: $engagementId) {
        id
        kind
        source
      }
    }
  `;
  const data = await gql.request<{
    orgMetadata: Array<{ id: string; kind: string; source: string }>;
  }>(query, { engagementId });
  return data.orgMetadata;
}

/** Email addresses discovered for an engagement (Phase 6.3). */
export async function emailsByEngagement(
  gql: GraphQLClient,
  engagementId: string,
): Promise<Array<{ id: string; address: string; source: string }>> {
  const query = /* GraphQL */ `
    query Emails($engagementId: ID!) {
      emails(engagementId: $engagementId) {
        id
        address
        source
      }
    }
  `;
  const data = await gql.request<{
    emails: Array<{ id: string; address: string; source: string }>;
  }>(query, { engagementId });
  return data.emails;
}

/** TLS certificates for an engagement (Phase 6.4). */
export async function tlsCertificatesByEngagement(
  gql: GraphQLClient,
  engagementId: string,
): Promise<Array<{ id: string; host: string; selfSigned: boolean; expired: boolean }>> {
  const query = /* GraphQL */ `
    query TlsCerts($engagementId: ID!) {
      tlsCertificates(engagementId: $engagementId) {
        id
        host
        selfSigned
        expired
      }
    }
  `;
  const data = await gql.request<{
    tlsCertificates: Array<{ id: string; host: string; selfSigned: boolean; expired: boolean }>;
  }>(query, { engagementId });
  return data.tlsCertificates;
}

/**
 * Returns the distinct scanner names that observed a given asset
 * (AssetDetail.scannerSources). Used to prove multi-source merge.
 */
export async function assetScannerSources(gql: GraphQLClient, assetId: string): Promise<string[]> {
  const query = /* GraphQL */ `
    query AssetSources($id: ID!) {
      assetDetail(id: $id) {
        id
        scannerSources
      }
    }
  `;
  const data = await gql.request<{ assetDetail: { id: string; scannerSources: string[] } }>(query, {
    id: assetId,
  });
  return data.assetDetail.scannerSources;
}

export interface CorrelatedFinding {
  id: string;
  title: string;
  severity: string;
  status: string;
  sourceCount: number;
  sources: string[];
  cveId?: string | null;
}

/**
 * Query `correlatedFindings(engagementId)` — the Phase 7 correlated-findings
 * surface. Returns an array (may be empty for a fresh engagement with no
 * findings yet). Used by correlation-v2-e2e to prove the resolver is wired
 * end-to-end.
 */
export async function correlatedFindingsByEngagement(
  gql: GraphQLClient,
  engagementId: string,
): Promise<CorrelatedFinding[]> {
  const res = await gql.request<{ correlatedFindings: CorrelatedFinding[] }>(
    /* GraphQL */ `
      query CF($engagementId: ID!) {
        correlatedFindings(engagementId: $engagementId) {
          id
          title
          severity
          status
          sourceCount
          sources
          cveId
        }
      }
    `,
    { engagementId },
  );
  return res.correlatedFindings;
}

/**
 * Mutation `setFindingStatus(id, status)` — triage a CorrelatedFinding.
 * Returns the updated finding with its new status (and other fields for
 * assertion convenience).
 */
export async function setFindingStatus(
  gql: GraphQLClient,
  id: string,
  status: string,
): Promise<CorrelatedFinding> {
  const res = await gql.request<{ setFindingStatus: CorrelatedFinding }>(
    /* GraphQL */ `
      mutation SF($id: ID!, $status: FindingStatus!) {
        setFindingStatus(id: $id, status: $status) {
          id
          title
          severity
          status
          sourceCount
          sources
          cveId
        }
      }
    `,
    { id, status },
  );
  return res.setFindingStatus;
}
