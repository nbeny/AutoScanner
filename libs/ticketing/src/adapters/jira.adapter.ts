import { Injectable } from '@nestjs/common';

import type { CreatedIssue, IssueInput, JiraConfig, TicketAdapter } from '../ticket-adapter';

/** Creates a Jira issue via the REST API v2 with Basic auth (email:token). */
@Injectable()
export class JiraTicketAdapter implements TicketAdapter<JiraConfig> {
  readonly provider = 'JIRA';

  async createIssue(config: JiraConfig, issue: IssueInput): Promise<CreatedIssue> {
    const base = config.baseUrl.replace(/\/$/, '');
    const auth = Buffer.from(`${config.email}:${config.token}`).toString('base64');
    const res = await fetch(`${base}/rest/api/2/issue`, {
      method: 'POST',
      headers: {
        authorization: `Basic ${auth}`,
        accept: 'application/json',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        fields: {
          project: { key: config.projectKey },
          summary: issue.title,
          description: issue.body,
          issuetype: { name: config.issueType ?? 'Task' },
          ...(issue.labels?.length ? { labels: issue.labels } : {}),
        },
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Jira issue create ${res.status}: ${text.slice(0, 200)}`);
    }
    const json = (await res.json()) as { key?: string };
    const key = json.key ?? '';
    return { externalId: key, externalUrl: `${base}/browse/${key}` };
  }
}
