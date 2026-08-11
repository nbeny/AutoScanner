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
        findingCount
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

export const SCAN_JOB_LOG_HISTORY_QUERY = gql`
  query ScanJobLogHistory($scanJobId: ID!) {
    scanJobLogHistory(scanJobId: $scanJobId)
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

export const REPORTS_QUERY = gql`
  query Reports($engagementId: ID) {
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

export const API_CREDENTIALS_QUERY = gql`
  query ApiCredentials {
    apiCredentials {
      provider
      createdAt
    }
  }
`;

export const SET_API_CREDENTIAL = gql`
  mutation SetApiCredential($provider: ApiProvider!, $secret: String!) {
    setApiCredential(provider: $provider, secret: $secret)
  }
`;

export const DELETE_API_CREDENTIAL = gql`
  mutation DeleteApiCredential($provider: ApiProvider!) {
    deleteApiCredential(provider: $provider)
  }
`;

export const SCHEDULES_QUERY = gql`
  query Schedules($engagementId: ID!) {
    schedules(engagementId: $engagementId) {
      id
      name
      cronExpr
      timezone
      targets
      enabled
      nextRunAt
      lastRunAt
      templateId
      template {
        id
        name
        displayName
      }
    }
  }
`;

export const CREATE_SCHEDULE_MUTATION = gql`
  mutation CreateSchedule($input: CreateScheduleInput!) {
    createSchedule(input: $input) {
      id
      name
      cronExpr
      timezone
      targets
      enabled
      nextRunAt
      templateId
      template {
        id
        displayName
      }
    }
  }
`;

export const UPDATE_SCHEDULE_MUTATION = gql`
  mutation UpdateSchedule($id: ID!, $input: UpdateScheduleInput!) {
    updateSchedule(id: $id, input: $input) {
      id
      enabled
      cronExpr
      timezone
      nextRunAt
    }
  }
`;

export const DELETE_SCHEDULE_MUTATION = gql`
  mutation DeleteSchedule($id: ID!) {
    deleteSchedule(id: $id)
  }
`;

export const NOTIFICATION_CHANNELS_QUERY = gql`
  query NotificationChannels {
    notificationChannels {
      id
      name
      type
      enabled
      eventFilters
      createdAt
      updatedAt
    }
  }
`;

export const CREATE_NOTIFICATION_CHANNEL_MUTATION = gql`
  mutation CreateNotificationChannel($input: CreateNotificationChannelInput!) {
    createNotificationChannel(input: $input) {
      id
      name
      type
      enabled
      eventFilters
    }
  }
`;

export const UPDATE_NOTIFICATION_CHANNEL_MUTATION = gql`
  mutation UpdateNotificationChannel($id: ID!, $input: UpdateNotificationChannelInput!) {
    updateNotificationChannel(id: $id, input: $input) {
      id
      enabled
      eventFilters
    }
  }
`;

export const DELETE_NOTIFICATION_CHANNEL_MUTATION = gql`
  mutation DeleteNotificationChannel($id: ID!) {
    deleteNotificationChannel(id: $id)
  }
`;

export const TEST_NOTIFICATION_CHANNEL_MUTATION = gql`
  mutation TestNotificationChannel($id: ID!) {
    testNotificationChannel(id: $id) {
      id
      deliveryStatus
    }
  }
`;

export const CHANNEL_DELIVERIES_QUERY = gql`
  query ChannelDeliveries($channelId: ID!) {
    channelDeliveries(channelId: $channelId) {
      id
      channelId
      eventType
      deliveryStatus
      attemptCount
      lastAttemptAt
      errorMessage
      sentAt
      createdAt
    }
  }
`;

export const AGENTS_QUERY = gql`
  query Agents {
    agents {
      id
      name
      hostname
      status
      capabilities
      version
      lastHeartbeatAt
      enrolledAt
      createdAt
    }
  }
`;

export const CREATE_AGENT_REGISTRATION_MUTATION = gql`
  mutation CreateAgentRegistration($input: CreateAgentRegistrationInput!) {
    createAgentRegistration(input: $input) {
      agentId
      bootstrapToken
    }
  }
`;

export const REVOKE_AGENT_MUTATION = gql`
  mutation RevokeAgent($id: ID!) {
    revokeAgent(id: $id)
  }
`;

export const ALL_SCANS_QUERY = gql`
  query AllScans($filter: ScansFilterInput) {
    allScans(filter: $filter) {
      id
      engagementId
      name
      status
      createdAt
      completedAt
      jobs {
        id
        scannerName
        target
        status
        durationMs
        exitCode
        errorMessage
        startedAt
        completedAt
        findingCount
      }
    }
  }
`;

export const CANCEL_SCAN_MUTATION = gql`
  mutation CancelScan($id: ID!) {
    cancelScan(id: $id) {
      id
      status
    }
  }
`;

export const CANCEL_SCAN_JOB_MUTATION = gql`
  mutation CancelScanJob($id: ID!) {
    cancelScanJob(id: $id) {
      id
      status
    }
  }
`;

export const RETRY_SCAN_MUTATION = gql`
  mutation RetryScan($id: ID!) {
    retryScan(id: $id) {
      id
      status
    }
  }
`;

export const RETRY_SCAN_JOB_MUTATION = gql`
  mutation RetryScanJob($id: ID!) {
    retryScanJob(id: $id) {
      id
      status
    }
  }
`;

export const SCANNER_CATALOG_QUERY = gql`
  query ScannerCatalog {
    scannerCatalog {
      name
      displayName
      description
      categories
      primaryCategory
      requiresCredential
      kaliToolRef
      fields {
        name
        type
        required
        default
        min
        max
        enumValues
        description
      }
      presets
    }
  }
`;

export const PREVIEW_SCAN_COMMAND_QUERY = gql`
  query PreviewScanCommand($scannerName: String!, $target: String!, $optionsJson: String) {
    previewScanCommand(scannerName: $scannerName, target: $target, optionsJson: $optionsJson) {
      image
      argv
      note
    }
  }
`;

export const TOOL_ACTIVITY_QUERY = gql`
  query ToolActivity($engagementId: ID) {
    toolActivity(engagementId: $engagementId) {
      scannerName
      totalExecutions
      successCount
      failureCount
      medianDurationMs
      totalFindings
      lastRunAt
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

export const COVERAGE_MATRIX_QUERY = gql`
  query CoverageMatrix($engagementId: ID) {
    coverageMatrix(engagementId: $engagementId) {
      assetType
      scannerName
      observationCount
      assetCount
      lastObservedAt
    }
  }
`;

export const ASSET_COVERAGE_QUERY = gql`
  query AssetCoverage($engagementId: ID, $assetType: String) {
    assetCoverage(engagementId: $engagementId, assetType: $assetType) {
      assetId
      assetValue
      assetType
      scannerName
      observationCount
      lastObservedAt
    }
  }
`;

export const TOOL_DETAIL_QUERY = gql`
  query ToolDetail($engagementId: ID, $scannerName: String!) {
    toolDetail(engagementId: $engagementId, scannerName: $scannerName) {
      scannerName
      runs {
        scanJobId
        status
        durationMs
        exitCode
        errorMessage
        completedAt
        agentId
      }
      recurringErrors {
        message
        count
      }
      agents {
        agentId
        executions
        successCount
      }
    }
  }
`;

export const COVERAGE_SUMMARY_QUERY = gql`
  query CoverageSummary($engagementId: ID) {
    coverageSummary(engagementId: $engagementId) {
      totalAssets
      scannedAssets
      percent
    }
  }
`;

export const SET_AWS_CREDENTIAL = gql`
  mutation SetAwsCredential($input: AwsCredentialInput!) {
    setAwsCredential(input: $input) {
      ok
      principal
      error
    }
  }
`;

export const SET_AZURE_CREDENTIAL = gql`
  mutation SetAzureCredential($input: AzureCredentialInput!) {
    setAzureCredential(input: $input) {
      ok
      principal
      error
    }
  }
`;

export const SET_GCP_CREDENTIAL = gql`
  mutation SetGcpCredential($input: GcpCredentialInput!) {
    setGcpCredential(input: $input) {
      ok
      principal
      error
    }
  }
`;

export const DELETE_CLOUD_CREDENTIAL = gql`
  mutation DeleteCloudCredential($provider: CloudProvider!) {
    deleteCloudCredential(provider: $provider)
  }
`;

export const CLOUD_CREDENTIAL_LIVE_CHECK = gql`
  query CloudCredentialLiveCheck($provider: CloudProvider!) {
    cloudCredentialLiveCheck(provider: $provider) {
      ok
      principal
      error
    }
  }
`;

export const AWS_CREDENTIAL_QUERY = gql`
  query AwsCredential {
    awsCredential {
      principal
      accountId
      region
      createdAt
      updatedAt
    }
  }
`;

export const AZURE_CREDENTIAL_QUERY = gql`
  query AzureCredential {
    azureCredential {
      principal
      subscriptionName
      createdAt
      updatedAt
    }
  }
`;

export const GCP_CREDENTIAL_QUERY = gql`
  query GcpCredential {
    gcpCredential {
      principal
      projectId
      createdAt
      updatedAt
    }
  }
`;

export const RUN_AI_SCAN = gql`
  mutation RunAiScan($input: RunAiScanInput!) {
    runAiScan(input: $input) {
      id
      status
      target
      strategy
    }
  }
`;

export const CHAINS = gql`
  query Chains {
    chains {
      name
      displayName
      description
      whenToUse
      produces
      scopeAcknowledgement
    }
  }
`;

export const RUN_CHAIN = gql`
  mutation RunChain($input: RunChainInput!) {
    runChain(input: $input) {
      id
      status
      target
    }
  }
`;

export const AI_RUN_QUERY = gql`
  query AiRun($id: ID!) {
    aiRun(id: $id) {
      id
      target
      strategy
      status
      scanCount
      currentDepth
      degraded
      auditText
      errorMessage
      createdAt
      startedAt
      completedAt
      nodes {
        id
        parentNodeId
        scanId
        scannerName
        target
        depth
        rationale
        status
        createdAt
        stepId
        skipReason
      }
      decisions {
        id
        round
        degraded
        createdAt
      }
    }
  }
`;

export const AI_RUN_EVENTS_SUBSCRIPTION = gql`
  subscription AiRunEvents($id: ID!) {
    aiRunEvents(id: $id) {
      type
      status
      errorMessage
      nodeId
      scannerName
      scanId
      depth
      round
    }
  }
`;

export const CANCEL_AI_RUN = gql`
  mutation CancelAiRun($id: ID!) {
    cancelAiRun(id: $id) {
      id
      status
    }
  }
`;

export const QUEUE_HEALTH_QUERY = gql`
  query QueueHealth {
    queueHealth {
      name
      waiting
      active
      completed
      failed
      delayed
      workers
    }
  }
`;

export const CANCEL_ALL_SCANS_MUTATION = gql`
  mutation CancelAllScans($engagementId: ID!) {
    cancelAllScans(engagementId: $engagementId)
  }
`;

export const KALI_TOOLS_QUERY = gql`
  query KaliTools {
    kaliTools {
      binary
      package
      displayName
      description
      categories
      hasHelp
      optionCount
    }
  }
`;

export const KALI_TOOL_QUERY = gql`
  query KaliTool($binary: String!) {
    kaliTool(binary: $binary) {
      binary
      displayName
      description
      homepage
      helpTextRaw
      parseConfidence
      manAvailable
      optionsSource
      manTextRaw
      options {
        flag
        argHint
        description
      }
    }
  }
`;

export const SCANNER_USAGE_STATS_QUERY = gql`
  query ScannerUsageStats($scannerName: String!) {
    scannerUsageStats(scannerName: $scannerName) {
      optionsJson
      count
    }
  }
`;
