import { Injectable } from '@nestjs/common';

import type { CreatedIssue, GitHubConfig, IssueInput, TicketAdapter } from '../ticket-adapter';

/** Creates a GitHub Issue via the REST API (no octokit dependency). */
@Injectable()
export class GitHubTicketAdapter implements TicketAdapter<GitHubConfig> {
  readonly provider = 'GITHUB';

  async createIssue(config: GitHubConfig, issue: IssueInput): Promise<CreatedIssue> {
    const base = (config.apiBaseUrl ?? 'https://api.github.com').replace(/\/$/, '');
    const res = await fetch(`${base}/repos/${config.repo}/issues`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${config.token}`,
        accept: 'application/vnd.github+json',
        'content-type': 'application/json',
        'user-agent': 'autoscanner',
      },
      body: JSON.stringify({ title: issue.title, body: issue.body, labels: issue.labels ?? [] }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`GitHub issue create ${res.status}: ${text.slice(0, 200)}`);
    }
    const json = (await res.json()) as { number?: number; html_url?: string };
    return {
      externalId: String(json.number ?? ''),
      externalUrl: json.html_url ?? `https://github.com/${config.repo}/issues/${json.number ?? ''}`,
    };
  }
}
