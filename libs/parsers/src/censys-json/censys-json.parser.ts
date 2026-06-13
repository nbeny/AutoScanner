import { Injectable } from '@nestjs/common';
import type { RawOutputFormat } from '@autoscanner/scanner-sdk';
import type { NormalizedOutput, Parser, ParserContext } from '../types';
import { emptyNormalizedOutput } from '../types';

@Injectable()
export class CensysJsonParser implements Parser {
  readonly name = 'censys-json';
  readonly formats: RawOutputFormat[] = ['JSON'];

  async parse(input: Buffer | string, _ctx: ParserContext): Promise<NormalizedOutput> {
    const out = emptyNormalizedOutput();
    const text = typeof input === 'string' ? input : input.toString('utf8');

    if (!text.trim()) return out;

    let parsed: unknown;
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      return out;
    }

    if (parsed !== null && typeof parsed === 'object') {
      out.orgMetadata.push({ kind: 'ORG', data: parsed });
    }

    return out;
  }
}
