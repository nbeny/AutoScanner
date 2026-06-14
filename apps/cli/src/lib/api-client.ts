import { GraphQLClient, Variables } from 'graphql-request';

export interface AuthPayload {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string };
}

export interface EngagementSummary {
  id: string;
  name: string;
  clientName: string;
  status: string;
  createdAt: string;
}

export interface RunScanInput {
  engagementId: string;
  scannerName: string;
  target: string;
  optionsJson?: string;
  name?: string;
}

export interface ScanSummary {
  id: string;
  status: string;
  engagementId: string;
  createdAt: string;
  jobs?: { id: string; status: string; scannerName: string; target: string }[];
}

const LOGIN = /* GraphQL */ `
  mutation Login($email: String!, $password: String!) {
    # placeholder — login is REST in this gateway; this constant is unused
    __typename
  }
`;

void LOGIN;

export class ApiClient {
  private readonly gql: GraphQLClient;

  constructor(
    private readonly baseUrl: string,
    private accessToken?: string,
  ) {
    this.gql = new GraphQLClient(`${baseUrl}/graphql`, { headers: this.authHeaders() });
  }

  private authHeaders(): Record<string, string> {
    return this.accessToken ? { authorization: `Bearer ${this.accessToken}` } : {};
  }

  setAccessToken(token: string): void {
    this.accessToken = token;
    this.gql.setHeaders(this.authHeaders());
  }

  async login(email: string, password: string): Promise<AuthPayload> {
    const res = await fetch(`${this.baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      throw new Error(`login failed: HTTP ${res.status} ${await safeText(res)}`);
    }
    return (await res.json()) as AuthPayload;
  }

  async createEngagement(input: {
    name: string;
    clientName: string;
    description?: string;
  }): Promise<EngagementSummary> {
    const query = /* GraphQL */ `
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
    const data = await this.gql.request<{ createEngagement: EngagementSummary }>(query, {
      input,
    } as Variables);
    return data.createEngagement;
  }

  async listEngagements(): Promise<EngagementSummary[]> {
    const query = /* GraphQL */ `
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
    const data = await this.gql.request<{ engagements: EngagementSummary[] }>(query);
    return data.engagements;
  }

  async runScan(input: RunScanInput): Promise<ScanSummary> {
    const query = /* GraphQL */ `
      mutation RunScan($input: RunScanInput!) {
        runScan(input: $input) {
          id
          status
          engagementId
          createdAt
          jobs {
            id
            status
            scannerName
            target
          }
        }
      }
    `;
    const data = await this.gql.request<{ runScan: ScanSummary }>(query, {
      input,
    } as Variables);
    return data.runScan;
  }

  async getScan(id: string): Promise<ScanSummary> {
    const query = /* GraphQL */ `
      query Scan($id: ID!) {
        scan(id: $id) {
          id
          status
          engagementId
          createdAt
          jobs {
            id
            status
            scannerName
            target
          }
        }
      }
    `;
    const data = await this.gql.request<{ scan: ScanSummary }>(query, { id } as Variables);
    return data.scan;
  }

  async fetchRawOutputUrl(scanJobId: string): Promise<string> {
    const res = await fetch(`${this.baseUrl}/scan-jobs/${scanJobId}/raw`, {
      method: 'GET',
      redirect: 'manual',
      headers: this.authHeaders(),
    });
    if (res.status === 302 || res.status === 301) {
      const loc = res.headers.get('location');
      if (!loc) throw new Error('raw output redirect missing Location header');
      return loc;
    }
    throw new Error(`raw output request failed: HTTP ${res.status} ${await safeText(res)}`);
  }

  async enrollAgent(body: EnrollAgentBody): Promise<EnrollAgentResult> {
    const res = await fetch(`${this.baseUrl}/agents/enroll`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(`enroll failed: HTTP ${res.status} ${await safeText(res)}`);
    }
    return (await res.json()) as EnrollAgentResult;
  }

  async agentHeartbeat(body: AgentHeartbeatBody): Promise<void> {
    const res = await fetch(`${this.baseUrl}/agents/heartbeat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(`heartbeat failed: HTTP ${res.status} ${await safeText(res)}`);
    }
  }

  async agentClaim(body: AgentClaimBody): Promise<AgentClaimResult | null> {
    const res = await fetch(`${this.baseUrl}/agents/jobs/claim`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(`claim failed: HTTP ${res.status} ${await safeText(res)}`);
    }
    const data = (await res.json()) as AgentClaimResult | null | Record<string, never>;
    // Server returns null or empty object when no job is available
    if (!data || !('jobId' in data) || !data.jobId) return null;
    return data as AgentClaimResult;
  }

  async agentSubmitResult(jobId: string, body: AgentSubmitResultBody): Promise<void> {
    const res = await fetch(`${this.baseUrl}/agents/jobs/${jobId}/result`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(`submit result failed: HTTP ${res.status} ${await safeText(res)}`);
    }
  }

  async listAgents(): Promise<AgentSummary[]> {
    const query = /* GraphQL */ `
      query Agents {
        agents {
          id
          name
          status
          lastHeartbeatAt
        }
      }
    `;
    const data = await this.gql.request<{ agents: AgentSummary[] }>(query);
    return data.agents;
  }
}

// ── Agent REST types ───────────────────────────────────────────────────────

export interface EnrollAgentBody {
  bootstrapToken: string;
  publicKey: string;
  capabilities?: Record<string, unknown>;
  hostname?: string;
  version?: string;
}

export interface EnrollAgentResult {
  agentId: string;
}

export interface AgentHeartbeatBody {
  agentId: string;
  ts: string;
  signature: string;
  capabilities?: Record<string, unknown>;
}

export interface AgentClaimBody {
  agentId: string;
  ts: string;
  signature: string;
}

export interface AgentClaimResult {
  jobId: string;
  scannerName: string;
  target: string;
  input?: Record<string, unknown>;
}

export interface AgentSubmitResultBody {
  agentId: string;
  ts: string;
  signature: string;
  exitCode: number;
  rawOutputBase64: string;
}

export interface AgentSummary {
  id: string;
  name: string;
  status: string;
  lastHeartbeatAt: string | null;
}

// ── Agent methods ──────────────────────────────────────────────────────────

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return '';
  }
}
