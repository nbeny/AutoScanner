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
