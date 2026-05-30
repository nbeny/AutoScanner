/**
 * Shared GraphQL response shapes for the e2e suites. Kept intentionally
 * lean: every field declared here must be `select`-ed by at least one
 * helper query — partial-shape interfaces let callers cherry-pick fields
 * via TypeScript without needing per-spec re-declarations.
 */

export interface AuthPayload {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface Engagement {
  id: string;
  name: string;
  status?: string;
}

export interface ScopeRule {
  id: string;
  engagementId: string;
  ruleType: string;
  targetType: string;
  value: string;
}

export interface TemplateRun {
  id: string;
  templateName: string;
  target: string;
  status: string;
  currentStepIndex: number;
  errorMessage?: string | null;
  completedAt?: string | null;
  scans?: { id: string }[];
}

export interface Port {
  id?: string;
  number: number;
  protocol: string;
  state: string;
  services?: { name?: string | null }[];
}

export interface Technology {
  id: string;
  name: string;
}

export interface Asset {
  id: string;
  type: string;
  value: string;
  canonicalValue?: string;
  lastSeenAt?: string;
  ports?: Port[] | null;
  technologies?: Technology[] | null;
}

export interface DnsRecord {
  id: string;
  type: string;
  name: string;
  value: string;
  firstSeenAt: string;
  lastSeenAt: string;
}

export interface Finding {
  id: string;
  title: string;
  severity: string;
}

export interface Scan {
  id: string;
  status: string;
  completedAt?: string | null;
  jobs: {
    id: string;
    scannerName: string;
    target: string;
    status: string;
    rawOutputKey?: string | null;
  }[];
}

export interface GqlErrorShape {
  message: string;
  extensions?: { code?: string };
}

export interface GqlError {
  response?: { errors?: GqlErrorShape[] };
}
