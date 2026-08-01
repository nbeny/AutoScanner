import { GitHubTicketAdapter } from '../adapters/github.adapter';
import { JiraTicketAdapter } from '../adapters/jira.adapter';
import { formatFindingIssue } from '../format-finding';

function mockFetch(status: number, body: unknown) {
  return jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  });
}

const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
});

describe('formatFindingIssue', () => {
  it('builds a severity-prefixed title, a Markdown body, and labels', () => {
    const issue = formatFindingIssue({
      title: 'SQL Injection',
      severity: 'CRITICAL',
      cveId: 'CVE-2021-1',
      assetValue: 'api.x.com',
      impact: 'RCE',
      remediation: ['Use parameterised queries'],
    });
    expect(issue.title).toBe('[CRITICAL] SQL Injection');
    expect(issue.body).toContain('**CVE:** CVE-2021-1');
    expect(issue.body).toContain('## Remediation');
    expect(issue.labels).toEqual(['autoscanner', 'severity:critical']);
  });
});

describe('GitHubTicketAdapter', () => {
  it('POSTs an issue and returns number + html_url', async () => {
    const fetch = mockFetch(201, { number: 42, html_url: 'https://github.com/o/r/issues/42' });
    global.fetch = fetch as never;

    const res = await new GitHubTicketAdapter().createIssue(
      { repo: 'o/r', token: 't' },
      { title: 'x', body: 'y' },
    );

    expect(res).toEqual({ externalId: '42', externalUrl: 'https://github.com/o/r/issues/42' });
    const [url, opts] = fetch.mock.calls[0];
    expect(url).toBe('https://api.github.com/repos/o/r/issues');
    expect((opts as { headers: Record<string, string> }).headers['authorization']).toBe('Bearer t');
  });

  it('throws on a non-2xx response', async () => {
    global.fetch = mockFetch(401, { message: 'Bad creds' }) as never;
    await expect(
      new GitHubTicketAdapter().createIssue({ repo: 'o/r', token: 'x' }, { title: 'x', body: 'y' }),
    ).rejects.toThrow(/GitHub issue create 401/);
  });
});

describe('JiraTicketAdapter', () => {
  it('POSTs an issue with Basic auth and returns the key + browse URL', async () => {
    const fetch = mockFetch(201, { key: 'SEC-7' });
    global.fetch = fetch as never;

    const res = await new JiraTicketAdapter().createIssue(
      { baseUrl: 'https://x.atlassian.net', email: 'a@x.io', token: 't', projectKey: 'SEC' },
      { title: 'x', body: 'y', labels: ['autoscanner'] },
    );

    expect(res).toEqual({
      externalId: 'SEC-7',
      externalUrl: 'https://x.atlassian.net/browse/SEC-7',
    });
    const [url, opts] = fetch.mock.calls[0];
    expect(url).toBe('https://x.atlassian.net/rest/api/2/issue');
    expect((opts as { headers: Record<string, string> }).headers['authorization']).toMatch(
      /^Basic /,
    );
  });
});
