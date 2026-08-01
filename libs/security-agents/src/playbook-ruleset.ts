/**
 * Playbook decision engine (Part 3 §4) — a versioned map from a detected technology/service to
 * the playbook and the scanners that playbook runs. It is the deterministic grounding the
 * Planner agent is given (and the fallback when Claude is unavailable), kept as data so it grows
 * without touching the agent. Keys are matched case-insensitively as substrings of a technology
 * token (e.g. "graphql", "kubernetes", "wordpress").
 */
export interface PlaybookRule {
  playbook: string;
  scanners: string[];
}

export interface PlaybookRuleset {
  version: number;
  byTechnology: Record<string, PlaybookRule>;
}

export const PLAYBOOK_RULESET: PlaybookRuleset = {
  version: 1,
  byTechnology: {
    graphql: { playbook: 'GRAPHQL_SECURITY', scanners: ['graphw00f', 'graphql-cop', 'nuclei'] },
    kubernetes: {
      playbook: 'KUBERNETES_SECURITY',
      scanners: ['kube-hunter', 'kubescape', 'trivy'],
    },
    s3: { playbook: 'CLOUD_S3_SECURITY', scanners: ['s3scanner', 'trivy'] },
    aws: { playbook: 'CLOUD_SECURITY', scanners: ['prowler', 'trivy', 'cloud-enum'] },
    'active-directory': { playbook: 'AD_SECURITY', scanners: ['enum4linux', 'kerbrute'] },
    ldap: { playbook: 'AD_SECURITY', scanners: ['enum4linux'] },
    wordpress: { playbook: 'WORDPRESS_SECURITY', scanners: ['wpscan', 'nuclei'] },
    nginx: { playbook: 'WEB_SERVER_SECURITY', scanners: ['nuclei', 'nikto'] },
    apache: { playbook: 'WEB_SERVER_SECURITY', scanners: ['nuclei', 'nikto'] },
    php: { playbook: 'WEB_APP_SECURITY', scanners: ['nuclei'] },
    api: { playbook: 'API_SECURITY', scanners: ['nuclei', 'kiterunner'] },
    tls: { playbook: 'TLS_SECURITY', scanners: ['testssl', 'tlsx'] },
  },
};

/** Deterministic playbook selection from a technology list (grounding + fallback for the Planner). */
export function selectPlaybooks(
  technologies: readonly string[],
  ruleset: PlaybookRuleset = PLAYBOOK_RULESET,
): PlaybookRule[] {
  const out: PlaybookRule[] = [];
  const seen = new Set<string>();
  for (const tech of technologies) {
    const t = tech.toLowerCase();
    for (const [key, rule] of Object.entries(ruleset.byTechnology)) {
      if (t.includes(key) && !seen.has(rule.playbook)) {
        seen.add(rule.playbook);
        out.push(rule);
      }
    }
  }
  return out;
}
