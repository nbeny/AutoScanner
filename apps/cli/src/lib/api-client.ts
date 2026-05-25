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
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return '';
  }
}
