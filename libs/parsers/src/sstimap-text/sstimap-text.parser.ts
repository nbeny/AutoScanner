import { Injectable } from '@nestjs/common';
import type { RawOutputFormat } from '@autoscanner/scanner-sdk';
import type { NormalizedOutput, Parser, ParserContext } from '../types';
import { emptyNormalizedOutput } from '../types';

const INJECTION_MARKER = /identified the following injection point/i;
const ENGINE_RE = /Engine:\s*([A-Za-z0-9_.\- ]+)/i;
const CODE_EVAL_RE = /code evaluation:\s*ok/i;

@Injectable()
export class SstimapTextParser implements Parser {
  readonly name = 'sstimap-text';
  readonly formats: RawOutputFormat[] = ['TEXT'];

  async parse(input: Buffer | string, ctx: ParserContext): Promise<NormalizedOutput> {
    const out = emptyNormalizedOutput();
    const text = Buffer.isBuffer(input) ? input.toString('utf8') : input;
    if (!text.trim() || !INJECTION_MARKER.test(text)) return out;

    const engine = text.match(ENGINE_RE)?.[1]?.trim() ?? 'unknown engine';
    const codeEval = CODE_EVAL_RE.test(text);

    out.findings.push({
      scannerName: ctx.scannerName,
      title: `Server-side template injection (${engine})`,
      severity: codeEval ? 'CRITICAL' : 'HIGH',
      location: ctx.target,
      description: codeEval
        ? `SSTImap confirmed SSTI in ${engine} with server-side code evaluation.`
        : `SSTImap confirmed SSTI in ${engine}.`,
      evidence: { engine, injectionClass: 'ssti', codeEvaluation: codeEval },
    });
    return out;
  }
}
