/** The issue an adapter creates in an external tracker, formatted from a finding. */
export interface IssueInput {
  title: string;
  body: string;
  labels?: string[];
}

/** Result of a successful external issue creation. */
export interface CreatedIssue {
  externalId: string;
  externalUrl: string;
}

/** GitHub Issues config (decrypted from IntegrationCredential). */
export interface GitHubConfig {
  /** e.g. "owner/repo". */
  repo: string;
  token: string;
  apiBaseUrl?: string; // GitHub Enterprise; defaults to api.github.com
}

/** Jira config (decrypted from IntegrationCredential). */
export interface JiraConfig {
  baseUrl: string; // https://your-domain.atlassian.net
  email: string;
  token: string;
  projectKey: string;
  issueType?: string; // defaults to "Task"
}

/**
 * A pluggable issue-tracker adapter (SP5). Given a decrypted provider config and a formatted
 * issue, it creates the external ticket and returns its id + URL. Adapters use `fetch` (no SDK
 * dependency); a failed HTTP call throws so the caller records the Ticket as FAILED.
 */
export interface TicketAdapter<Config> {
  readonly provider: string;
  createIssue(config: Config, issue: IssueInput): Promise<CreatedIssue>;
}
