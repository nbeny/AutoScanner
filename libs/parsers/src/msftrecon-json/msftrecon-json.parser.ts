import { Injectable } from '@nestjs/common';
import type { RawOutputFormat } from '@autoscanner/scanner-sdk';
import type { NormalizedFinding, NormalizedOutput, Parser, ParserContext } from '../types';
import { emptyNormalizedOutput } from '../types';

interface MsftreconPayload {
  domain?: string;
  tenantId?: string;
  tenantName?: string;
  federationBrandName?: string;
  nameSpaceType?: string;
  federationProtocol?: string;
  spf?: string | null;
  dkim?: Record<string, boolean>;
  mtaSts?: Record<string, unknown>;
  mxRecords?: string[];
}

function dkimAnyActive(dkim: Record<string, boolean> | undefined): boolean {
  if (!dkim) return false;
  return Object.values(dkim).some((enabled) => enabled === true);
}

function classifyFederation(
  nameSpaceType: string | undefined,
  protocol: string | undefined,
): NormalizedFinding['severity'] | null {
  if (nameSpaceType !== 'Federated') return null;
  const p = (protocol ?? '').toLowerCase();
  if (p.includes('wsfederation') || p.includes('wsfed') || p === 'legacy') return 'MEDIUM';
  return null;
}

@Injectable()
export class MsftreconJsonParser implements Parser {
  readonly name = 'msftrecon-json';
  readonly formats: RawOutputFormat[] = ['JSON'];

  async parse(input: Buffer | string, ctx: ParserContext): Promise<NormalizedOutput> {
    const out = emptyNormalizedOutput();
    const text = typeof input === 'string' ? input : input.toString('utf8');
    if (!text.trim()) return out;

    let parsed: MsftreconPayload;
    try {
      parsed = JSON.parse(text) as MsftreconPayload;
    } catch {
      return out;
    }

    out.orgMetadata.push({ kind: 'OTHER', data: parsed });

    const location = parsed.domain ?? ctx.target;

    if (!parsed.spf || parsed.spf.trim() === '') {
      out.findings.push({
        scannerName: ctx.scannerName,
        title: 'MSFTRECON_SPF_MISSING',
        severity: 'LOW',
        location,
        description: 'No SPF record published for the domain.',
      });
    }

    if (!dkimAnyActive(parsed.dkim)) {
      out.findings.push({
        scannerName: ctx.scannerName,
        title: 'MSFTRECON_DKIM_MISSING',
        severity: 'LOW',
        location,
        description: 'No DKIM selector returned an active signing key.',
      });
    }

    const fedSeverity = classifyFederation(parsed.nameSpaceType, parsed.federationProtocol);
    if (fedSeverity) {
      out.findings.push({
        scannerName: ctx.scannerName,
        title: 'MSFTRECON_LEGACY_FEDERATION',
        severity: fedSeverity,
        location,
        description: `Federated tenant uses legacy protocol "${parsed.federationProtocol ?? 'unknown'}".`,
      });
    }

    return out;
  }
}
