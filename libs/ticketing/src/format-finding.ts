import type { IssueInput } from './ticket-adapter';

export interface FindingForTicket {
  title: string;
  severity: string;
  cveId?: string | null;
  location?: string | null;
  assetValue?: string | null;
  impact?: string | null;
  action?: string | null;
  remediation?: string[] | null;
}

/** Formats a finding (optionally enriched by the AI fleet) into an issue title + Markdown body. */
export function formatFindingIssue(f: FindingForTicket): IssueInput {
  const title = `[${f.severity}] ${f.title}`;
  const lines: string[] = [
    `**Severity:** ${f.severity}`,
    f.cveId ? `**CVE:** ${f.cveId}` : '',
    f.assetValue ? `**Asset:** ${f.assetValue}` : '',
    f.location ? `**Location:** ${f.location}` : '',
    '',
    f.impact ? `## Impact\n${f.impact}` : '',
    f.action ? `## Recommended action\n${f.action}` : '',
    f.remediation?.length ? `## Remediation\n${f.remediation.map((s) => `- ${s}`).join('\n')}` : '',
    '',
    '_Filed automatically by AutoScanner._',
  ].filter(Boolean);

  const labels = ['autoscanner', `severity:${f.severity.toLowerCase()}`];
  return { title, body: lines.join('\n'), labels };
}
