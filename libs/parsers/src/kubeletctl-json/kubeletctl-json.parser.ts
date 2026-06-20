import { Injectable } from '@nestjs/common';
import type { RawOutputFormat } from '@autoscanner/scanner-sdk';
import type { NormalizedOutput, Parser, ParserContext } from '../types';
import { emptyNormalizedOutput } from '../types';

interface KubeletPod {
  metadata?: { name?: string; namespace?: string };
}
interface KubeletPodList {
  items?: KubeletPod[];
}

@Injectable()
export class KubeletctlJsonParser implements Parser {
  readonly name = 'kubeletctl-json';
  readonly formats: RawOutputFormat[] = ['JSON'];

  async parse(input: Buffer | string, ctx: ParserContext): Promise<NormalizedOutput> {
    const out = emptyNormalizedOutput();
    const text = typeof input === 'string' ? input : input.toString('utf8');

    let parsed: KubeletPodList;
    try {
      parsed = JSON.parse(text) as KubeletPodList;
    } catch {
      return out;
    }
    const items = Array.isArray(parsed?.items) ? parsed.items : [];
    if (items.length === 0) return out;

    const pods = items.map((p) => {
      const ns = p.metadata?.namespace ?? 'default';
      const name = p.metadata?.name ?? '<unknown>';
      return `${ns}/${name}`;
    });

    out.findings.push({
      scannerName: 'kubeletctl',
      title: 'Anonymous kubelet API access (pod listing)',
      severity: 'HIGH',
      location: ctx.target,
      description:
        'The kubelet on this node answered an anonymous /pods request, listing running pods. ' +
        'Anonymous kubelet access typically enables container exec/run.',
      evidence: { podCount: pods.length, pods },
    });

    return out;
  }
}
