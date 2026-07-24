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
- Choose scanners ONLY by their exact "name" from the provided catalog. Never invent scanner names. Provide inputs matching the scanner's listed input keys.
- Target new scans at the most specific relevant asset discovered (a URL, host, or service) rather than always the root target.

OUTPUT CONTRACT — respond with ONLY a single JSON object and nothing else (no markdown, no prose, no code fences):
{"done": boolean, "rationale": string, "next": [{"scannerName": string, "target": string, "inputs": object, "why": string}]}
- "done": true when the engagement is complete or budget is exhausted; otherwise false.
- "rationale": a brief explanation of your reasoning this round.
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
  return `Current world state (JSON):
${JSON.stringify(worldState, null, 2)}

Available scanners (choose by exact name):
${catalogText}

Budget remaining:
- scans: ${budgetRemaining.scans}
- depth: ${budgetRemaining.depth}

Given this, what scanner(s) should run next? Return the JSON decision.`;
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
