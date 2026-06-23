import { Injectable, Logger } from '@nestjs/common';
import type { RawOutputFormat } from '@autoscanner/scanner-sdk';
import type {
  NormalizedFinding,
  NormalizedOutput,
  Parser,
  ParserContext,
  Severity,
} from '../types';
import { emptyNormalizedOutput } from '../types';

interface ZapInstance {
  uri?: string;
  method?: string;
  param?: string;
  evidence?: string;
}
interface ZapAlert {
  alert?: string;
  name?: string;
  riskcode?: string;
  desc?: string;
  solution?: string;
  cweid?: string;
  pluginid?: string;
  instances?: ZapInstance[];
}
interface ZapSite {
  '@name'?: string;
  alerts?: ZapAlert[];
}
interface ZapReport {
  site?: ZapSite[];
}

// ZAP riskcode: 0 informational, 1 low, 2 medium, 3 high. ZAP has no "critical".
function severityFromRiskcode(code: string | undefined): Severity {
  switch ((code ?? '').trim()) {
    case '3':
      return 'HIGH';
    case '2':
      return 'MEDIUM';
    case '1':
      return 'LOW';
    default:
      return 'INFO';
  }
}

const CLASS_KEYWORDS: ReadonlyArray<[RegExp, string]> = [
  [/ssrf/i, 'ssrf'],
  [/(lfi|path traversal|file inclusion)/i, 'lfi'],
  [/xxe|external entity/i, 'xxe'],
  [/open redirect/i, 'open-redirect'],
  [/template injection|ssti/i, 'ssti'],
  [/sql injection|sqli/i, 'sqli'],
  [/(command injection|remote code|os command)/i, 'cmdi'],
  [/cross[- ]site scripting|xss/i, 'xss'],
];

function classify(name: string, cweid: string | undefined): string {
  for (const [re, cls] of CLASS_KEYWORDS) if (re.test(name)) return cls;
  if (cweid === '89') return 'sqli';
  if (cweid === '79') return 'xss';
  if (cweid === '78') return 'cmdi';
  if (cweid === '611') return 'xxe';
  if (cweid === '918') return 'ssrf';
  return 'other';
}

@Injectable()
export class ZapJsonParser implements Parser {
  private readonly logger = new Logger(ZapJsonParser.name);
  readonly name = 'zap-json';
  readonly formats: RawOutputFormat[] = ['JSON'];

  async parse(input: Buffer | string, ctx: ParserContext): Promise<NormalizedOutput> {
    const out = emptyNormalizedOutput();
    const text = Buffer.isBuffer(input) ? input.toString('utf8') : input;
    if (!text.trim()) return out;

    let report: ZapReport;
    try {
      report = JSON.parse(text) as ZapReport;
    } catch {
      this.logger.warn('skipping malformed ZAP JSON report');
      return out;
    }

    for (const site of report.site ?? []) {
      for (const alert of site.alerts ?? []) {
        const name = alert.name ?? alert.alert;
        if (typeof name !== 'string' || !name) continue;

        const instance = alert.instances?.[0];
        const location = instance?.uri ?? site['@name'] ?? ctx.target;
        const cweid = alert.cweid;

        const finding: NormalizedFinding = {
          scannerName: ctx.scannerName,
          title: name,
          severity: severityFromRiskcode(alert.riskcode),
          location,
          templateId: alert.pluginid,
          description: typeof alert.desc === 'string' ? alert.desc : undefined,
          evidence: {
            injectionClass: classify(name, cweid),
            ...(cweid ? { cweid } : {}),
            ...(instance?.param ? { param: instance.param } : {}),
            ...(instance?.method ? { method: instance.method } : {}),
            ...(instance?.evidence ? { evidence: instance.evidence } : {}),
            ...(alert.solution ? { solution: alert.solution } : {}),
          },
        };
        out.findings.push(finding);
      }
    }
    return out;
  }
}
