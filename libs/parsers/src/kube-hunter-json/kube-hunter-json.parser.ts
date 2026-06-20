import { Injectable } from '@nestjs/common';
import type { RawOutputFormat } from '@autoscanner/scanner-sdk';
import type { NormalizedOutput, Parser, ParserContext, Severity } from '../types';
import { emptyNormalizedOutput } from '../types';

interface KubeHunterVuln {
  location?: string;
  vid?: string;
  category?: string;
  severity?: string;
  vulnerability?: string;
  description?: string;
  evidence?: string;
  hunter?: string;
}
interface KubeHunterReport {
  vulnerabilities?: KubeHunterVuln[];
}

function mapSeverity(value: string | undefined): Severity {
  switch ((value ?? '').trim().toLowerCase()) {
    case 'high':
      return 'HIGH';
    case 'medium':
      return 'MEDIUM';
    case 'low':
      return 'LOW';
    default:
      return 'INFO';
  }
}

@Injectable()
export class KubeHunterJsonParser implements Parser {
  readonly name = 'kube-hunter-json';
  readonly formats: RawOutputFormat[] = ['JSON'];

  async parse(input: Buffer | string, _ctx: ParserContext): Promise<NormalizedOutput> {
    const out = emptyNormalizedOutput();
    const text = typeof input === 'string' ? input : input.toString('utf8');

    let report: KubeHunterReport;
    try {
      report = JSON.parse(text) as KubeHunterReport;
    } catch {
      return out;
    }
    if (!report || typeof report !== 'object') return out;

    for (const vuln of report.vulnerabilities ?? []) {
      out.findings.push({
        scannerName: 'kube-hunter',
        title: vuln.vulnerability ?? 'Kubernetes finding',
        severity: mapSeverity(vuln.severity),
        location: vuln.location,
        description: vuln.description,
        evidence: {
          category: vuln.category,
          evidence: vuln.evidence,
          hunter: vuln.hunter,
          vid: vuln.vid,
        },
      });
    }

    return out;
  }
}
