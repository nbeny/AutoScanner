import type { AuditInput } from './evaluation';

const SEVERITY_ORDER = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'];

/** Génère un audit Markdown déterministe à partir de la trace (fonction pure). */
export function buildAudit(input: AuditInput): string {
  const ran = input.steps.filter((s) => s.action === 'run');
  const skipped = input.steps.filter((s) => s.action === 'skip');

  const branches = ran
    .filter((s) => s.gate.predicates.length > 0)
    .map((s) => `${s.scannerName} (${s.gate.predicates.map((p) => p.pred).join(', ')})`);

  const techs = [...input.discovered.technologies].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  const sevLines = SEVERITY_ORDER.filter(
    (s) => input.discovered.findings.bySeverity[s] != null,
  ).map((s) => `${s}: ${input.discovered.findings.bySeverity[s]}`);
  const otherSevs = Object.keys(input.discovered.findings.bySeverity)
    .filter((s) => !SEVERITY_ORDER.includes(s))
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    .map((s) => `${s}: ${input.discovered.findings.bySeverity[s]}`);
  const allSevs = [...sevLines, ...otherSevs];

  const skipLines = skipped.map((s) => `- ${s.scannerName} — ${s.skipReason ?? 'skip'}`);

  return [
    `# Chaîne « ${input.chainDisplayName} » — ${input.target}`,
    '',
    `Étapes : ${ran.length} lancée(s), ${skipped.length} skippée(s)`,
    '',
    '## Découvert',
    `- IP : ${input.discovered.ipAddresses}`,
    `- Technologies : ${techs.length > 0 ? techs.join(', ') : '—'}`,
    `- Endpoints : ${input.discovered.endpoints}`,
    `- Findings : ${input.discovered.findings.total}${allSevs.length > 0 ? ` (${allSevs.join(' · ')})` : ''}`,
    '',
    '## Branches déclenchées',
    branches.length > 0 ? branches.map((b) => `- ${b}`).join('\n') : '- —',
    '',
    '## Skippé',
    skipLines.length > 0 ? skipLines.join('\n') : '- —',
  ].join('\n');
}
