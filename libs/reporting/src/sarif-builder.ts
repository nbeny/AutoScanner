export type SarifSeverityInput = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO' | string;
export type SarifLevel = 'error' | 'warning' | 'note';

export interface SarifFindingInput {
  ruleId: string;
  severity: SarifSeverityInput;
  title: string;
  description?: string;
  assetCanonicalValue?: string;
  cveId?: string | null;
}

export interface SarifReport {
  $schema: string;
  version: '2.1.0';
  runs: SarifRun[];
}

interface SarifRun {
  tool: {
    driver: {
      name: string;
      version: string;
      rules: SarifRule[];
    };
  };
  results: SarifResult[];
}

interface SarifRule {
  id: string;
  name: string;
  shortDescription: { text: string };
  fullDescription?: { text: string };
}

interface SarifResult {
  ruleId: string;
  level: SarifLevel;
  message: { text: string };
  locations?: { physicalLocation: { artifactLocation: { uri: string } } }[];
}

function mapLevel(severity: SarifSeverityInput): SarifLevel {
  const s = String(severity).toUpperCase();
  if (s === 'CRITICAL' || s === 'HIGH') return 'error';
  if (s === 'MEDIUM') return 'warning';
  return 'note';
}

export class SarifBuilder {
  build(findings: SarifFindingInput[], toolVersion: string): SarifReport {
    const rulesById = new Map<string, SarifRule>();
    const results: SarifResult[] = [];

    for (const f of findings) {
      if (!rulesById.has(f.ruleId)) {
        rulesById.set(f.ruleId, {
          id: f.ruleId,
          name: f.title,
          shortDescription: { text: f.title },
          fullDescription: f.description ? { text: f.description } : undefined,
        });
      }
      const result: SarifResult = {
        ruleId: f.ruleId,
        level: mapLevel(f.severity),
        message: { text: f.description ?? f.title },
      };
      if (f.assetCanonicalValue) {
        result.locations = [
          { physicalLocation: { artifactLocation: { uri: f.assetCanonicalValue } } },
        ];
      }
      results.push(result);
    }

    return {
      $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
      version: '2.1.0',
      runs: [
        {
          tool: {
            driver: {
              name: 'AutoScanner',
              version: toolVersion,
              rules: Array.from(rulesById.values()),
            },
          },
          results,
        },
      ],
    };
  }
}
