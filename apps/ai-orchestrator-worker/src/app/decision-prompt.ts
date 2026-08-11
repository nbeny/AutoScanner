import type { WorldState } from './world-state.service';

/**
 * Bump when the methodology or output contract changes, so runs can be
 * attributed to a prompt revision.
 */
export const DECISION_PROMPT_VERSION = 'v1';

/**
 * The versioned system prompt that frames Claude as an autonomous pentest
 * operator. It fixes the staged methodology, the exhaustiveness mandate, the
 * "choose scanners by exact catalog name" rule, and the strict JSON output
 * contract that {@link validateDecision} consumes.
 */
export function buildSystemPrompt(): string {
  return `You are AutoHunt (prompt ${DECISION_PROMPT_VERSION}), an autonomous offensive-security operator driving a fleet of security scanners against an authorized target. You decide, one round at a time, which scanner(s) to run next based on everything discovered so far.

METHODOLOGY — follow this staged pentest workflow, advancing stages as new information appears:
1. Reconnaissance: subdomain/DNS/OSINT discovery to map the attack surface.
2. Port & service enumeration: scan discovered hosts for open ports and identify services.
3. Per-service deep enumeration: for each identified service (SMB, LDAP, SNMP, SMTP, SSH, RDP, databases, etc.) run the matching service-specific enumeration scanner.
4. Web discovery: for HTTP(S) services, fingerprint technologies and crawl/brute-force for URLs, endpoints, and parameters.
5. Vulnerability scanning: run vuln scanners (nuclei-style, CVE, misconfiguration) against enumerated hosts, services, and web apps.
6. Active injection: when concrete URLs and parameters exist, run active injection scanners (XSS, SQLi, command injection, SSTI, DAST).
7. Opportunistic exploitation: when a foothold is plausible (exposed service, weak credentials, exploitable finding), select scanners/tools that pursue it (e.g. pwncat-style footholds).

PRINCIPLES:
- Be EXHAUSTIVE: scan everything that plausibly applies to find every vulnerability. Do not stop early while unexplored, applicable scanners remain and budget allows.
- Respect the stated budget. When the remaining scan or depth budget is exhausted, set "done": true and stop proposing scans.
- Avoid redundant work: do not re-run a scanner already listed in scannersRun against the same target unless new information makes it worthwhile.
- Choose scanners ONLY by their exact "name" (the catalog lists a shortlist, but you may name ANY registered Kali binary by its exact name). Never invent scanner names.
- Set "args" to the tool's CLI flags as a single string. The run target is auto-appended to the command, so you usually do NOT repeat it; if a tool needs the target mid-command, put the literal {{target}} where it belongs. Leave "args" as "" to run the tool with just the target.
- Read the "recentOutputs" excerpts (raw stdout of prior scans) and let them drive your next choice.
- Target new scans at the most specific relevant asset seen in prior output (a URL, host, or service) rather than always the root target.

OUTPUT CONTRACT — respond with ONLY a single JSON object and nothing else (no markdown, no prose, no code fences):
{"done": boolean, "rationale": string, "next": [{"scannerName": string, "target": string, "args": string, "why": string}]}
- "done": true when the engagement is complete or budget is exhausted; otherwise false.
- "rationale": a brief explanation of your reasoning this round.
- "args": the CLI flags string for the tool (may be "").
- "next": the scanner(s) to run next (may be empty when done).`;
}

/**
 * Build the per-round user prompt: the current world state, the scanner
 * catalog, and remaining budget, ending with the decision request.
 */
export function buildUserPrompt(args: {
  worldState: WorldState;
  catalogText: string;
  budgetRemaining: { scans: number; depth: number };
}): string {
  const { worldState, catalogText, budgetRemaining } = args;
  return `Target: ${worldState.target}
Scanners already run: ${worldState.scannersRun.length ? worldState.scannersRun.join(', ') : '(none yet)'}

${renderRecentOutputs(worldState.recentOutputs)}

Available scanners (choose by exact name):
${catalogText}

Budget remaining:
- scans: ${budgetRemaining.scans}
- depth: ${budgetRemaining.depth}

Given this, what scanner(s) should run next? Return the JSON decision.`;
}

/** Render prior scans' raw stdout excerpts as readable, delimited blocks. */
function renderRecentOutputs(
  outputs: { scanner: string; target: string; excerpt: string }[],
): string {
  if (outputs.length === 0) {
    return 'Recent scan output: (none yet — this is the first round)';
  }
  const blocks = outputs.map((o) => {
    const body = o.excerpt.trim() || '(empty output)';
    return `--- ${o.scanner} @ ${o.target} ---\n${body}`;
  });
  return `Recent scan output (raw stdout excerpts, truncated):\n${blocks.join('\n\n')}`;
}

/**
 * Build the final audit prompt: asks Claude to synthesize a human-readable
 * pentest report in markdown from the run's findings and decision trail.
 */
export function buildAuditPrompt(args: {
  target: string;
  findings: { title: string; severity: string }[];
  decisions: { round: number; rationale: string }[];
}): string {
  const { target, findings, decisions } = args;
  return `Write a concise penetration-test AUDIT report in Markdown for the engagement against "${target}".

Use these sections:
1. Executive Summary — a short, non-technical overview of the engagement and overall risk.
2. Key Findings by Severity — group findings under CRITICAL/HIGH/MEDIUM/LOW/INFO headings.
3. Attack Path Narrative — a chronological story of how the assessment progressed, derived from the decision log.
4. Recommendations — prioritized, actionable remediation guidance.

Findings (JSON):
${JSON.stringify(findings, null, 2)}

Decision log (JSON):
${JSON.stringify(decisions, null, 2)}

Return ONLY the Markdown report.`;
}
