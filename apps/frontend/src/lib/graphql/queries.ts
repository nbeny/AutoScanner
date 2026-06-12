import { gql } from '@apollo/client';

export const ENGAGEMENTS_QUERY = gql`
  query Engagements {
    engagements {
      id
      name
      clientName
      status
      createdAt
    }
  }
`;

export const CREATE_ENGAGEMENT_MUTATION = gql`
  mutation CreateEngagement($input: CreateEngagementInput!) {
    createEngagement(input: $input) {
      id
      name
      clientName
      status
      createdAt
    }
  }
`;

export const SCANS_QUERY = gql`
  query Scans($engagementId: ID!) {
    scans(engagementId: $engagementId) {
      id
      status
      createdAt
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
`;

export const SCAN_QUERY = gql`
  query Scan($id: ID!) {
    scan(id: $id) {
      id
      status
      createdAt
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
`;

export const RUN_SCAN_MUTATION = gql`
  mutation RunScan($input: RunScanInput!) {
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
`;

// Fat query used by the scan-run AssetsTable, which renders ports + services
// inline. Per-kind engagement tabs use the leaner queries below to avoid the
// eager JOIN on Ports/Services/Technologies for every row.
export const ASSETS_QUERY = gql`
  query Assets($engagementId: ID!) {
    assets(engagementId: $engagementId) {
      id
      value
      type
      lastSeenAt
      ports {
        number
        protocol
        state
        services {
          name
          product
          version
        }
      }
      technologies {
        id
        name
        version
      }
    }
  }
`;

// Lean query for per-kind tabs (DOMAIN/SUBDOMAIN/IP). The resolver inspects
// the selection set and skips the ports/technologies Prisma joins entirely
// when neither is requested, so this avoids the JOIN cost server-side too.
export const ASSETS_BY_TYPE_QUERY = gql`
  query AssetsByType($engagementId: ID!, $types: [AssetType!]) {
    assets(engagementId: $engagementId, types: $types) {
      id
      value
      type
      lastSeenAt
    }
  }
`;

// Selects only assets carrying technologies. We still fetch all assets and
// flatten client-side because Technology is not a top-level engagement query;
// the resolver skips the ports JOIN since it's not selected.
export const ASSET_TECHNOLOGIES_QUERY = gql`
  query AssetTechnologies($engagementId: ID!) {
    assets(engagementId: $engagementId) {
      id
      technologies {
        id
        name
        version
      }
    }
  }
`;

// Pass severities=null to mean "no filter" (all severities). Pass an explicit
// array (possibly empty) to filter; an empty array also means "no filter" on
// the backend side. The frontend always sends `null` when every checkbox is on.
export const FINDINGS_QUERY = gql`
  query Findings($engagementId: ID!, $severities: [Severity!]) {
    findings(engagementId: $engagementId, severities: $severities) {
      id
      title
      severity
      location
      cveId
      templateId
      firstSeenAt
      lastSeenAt
    }
  }
`;

export const SCAN_JOB_LOGS_SUBSCRIPTION = gql`
  subscription ScanJobLogs($scanJobId: ID!) {
    scanJobLogs(scanJobId: $scanJobId) {
      scanJobId
      stream
      ts
      chunk
    }
  }
`;

export const SCAN_TEMPLATES_QUERY = gql`
  query ScanTemplates {
    scanTemplates {
      id
      name
      displayName
      description
    }
  }
`;

export const RUN_TEMPLATE_MUTATION = gql`
  mutation RunTemplate($input: RunTemplateInput!) {
    runTemplate(input: $input) {
      id
      templateName
      target
      status
      currentStepIndex
      startedAt
      completedAt
      errorMessage
    }
  }
`;

export const TEMPLATE_RUN_QUERY = gql`
  query TemplateRun($id: ID!) {
    templateRun(id: $id) {
      id
      templateName
      target
      status
      currentStepIndex
      startedAt
      completedAt
      errorMessage
      scans {
        id
        status
        createdAt
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
  }
`;

export const ENGAGEMENT_OVERVIEW_QUERY = gql`
  query EngagementOverview($engagementId: ID!) {
    engagementOverview(engagementId: $engagementId) {
      domains
      subdomains
      ipAddresses
      openPorts
      uniqueTechs
      findingsBySeverity {
        critical
        high
        medium
        low
        info
      }
    }
  }
`;

export const TOP_FINDINGS_QUERY = gql`
  query TopFindings($engagementId: ID!, $limit: Int) {
    topFindings(engagementId: $engagementId, limit: $limit) {
      dedupHash
      title
      severity
      cveId
      affectedAssetCount
      scannerSources
      firstSeenAt
      lastSeenAt
      exampleAssetId
    }
  }
`;

export const TOP_ASSETS_QUERY = gql`
  query TopAssets($engagementId: ID!, $limit: Int) {
    topAssets(engagementId: $engagementId, limit: $limit) {
      id
      kind
      canonicalValue
      firstSeenAt
      lastSeenAt
      findingsCount
      criticalCount
      highCount
    }
  }
`;

export const RECENT_TEMPLATE_RUNS_QUERY = gql`
  query RecentTemplateRuns($engagementId: ID!, $limit: Int) {
    recentTemplateRuns(engagementId: $engagementId, limit: $limit) {
      id
      templateName
      status
      startedAt
      completedAt
      durationMs
      newAssetsCount
      newFindingsCount
    }
  }
`;

export const UNIFIED_ASSETS_SCORED_QUERY = gql`
  query UnifiedAssetsScored(
    $engagementId: ID!
    $kinds: [AssetType!]
    $search: String
    $limit: Int = 100
    $offset: Int = 0
    $filters: AssetFilters
    $sort: AssetSort
  ) {
    unifiedAssets(
      engagementId: $engagementId
      kinds: $kinds
      search: $search
      limit: $limit
      offset: $offset
      filters: $filters
      sort: $sort
    ) {
      id
      kind
      canonicalValue
      displayName
      firstSeenAt
      lastSeenAt
      riskScore
    }
  }
`;

export const ASSET_FACETS_QUERY = gql`
  query AssetFacets($engagementId: ID!, $filters: AssetFilters) {
    assetFacets(engagementId: $engagementId, filters: $filters) {
      kindCounts {
        kind
        count
      }
      severityCounts {
        severity
        count
      }
      topTechs {
        name
        count
      }
      scannerSources
    }
  }
`;

export const ASSET_DETAIL_QUERY = gql`
  query AssetDetail($id: ID!) {
    assetDetail(id: $id) {
      id
      kind
      canonicalValue
      riskScore
      firstSeenAt
      lastSeenAt
      deletedAt
      ports {
        id
        number
        protocol
        state
        lastSeenAt
      }
      services {
        id
        name
        product
        version
      }
      technologies {
        id
        name
        version
        source
      }
      dnsRecords {
        id
        type
        name
        value
      }
      findings {
        id
        title
        severity
        location
        cveId
        templateId
        firstSeenAt
        lastSeenAt
      }
      ipAddresses
      subdomains
      scannerSources
      observations {
        id
        kind
        scannerName
        ts
        payload
      }
    }
  }
`;

export const ASSET_OBSERVATIONS_QUERY = gql`
  query AssetObservations($assetId: ID!, $after: String, $limit: Int) {
    assetObservations(assetId: $assetId, after: $after, limit: $limit) {
      items {
        id
        kind
        scannerName
        ts
        payload
      }
      nextCursor
      hasMore
    }
  }
`;

export const ENGAGEMENT_UPDATED_SUBSCRIPTION = gql`
  subscription EngagementUpdated($engagementId: ID!) {
    engagementUpdated(engagementId: $engagementId) {
      kind
      engagementId
      assetId
      templateRunId
      ts
    }
  }
`;

export const CVE_INFO_QUERY = gql`
  query CveInfo($cveId: String!) {
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
`;

export const REPORTS_QUERY = gql`
  query Reports($engagementId: ID!) {
    reports(engagementId: $engagementId) {
      id
      format
      status
      sizeBytes
      contentType
      errorMessage
      createdAt
      startedAt
      completedAt
      downloadUrl
      template {
        id
        slug
        name
        format
      }
    }
  }
`;

export const REPORT_TEMPLATES_QUERY = gql`
  query ReportTemplates {
    reportTemplates {
      id
      slug
      name
      description
      format
      isDefault
    }
  }
`;

export const GENERATE_REPORT_MUTATION = gql`
  mutation GenerateReport($input: GenerateReportInput!) {
    generateReport(input: $input) {
      id
      status
      format
      template {
        id
        slug
        name
      }
    }
  }
`;
