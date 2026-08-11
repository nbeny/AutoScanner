import { Injectable } from '@nestjs/common';
import type { RawOutputFormat } from '@autoscanner/scanner-sdk';
import {
  type Parser,
  type ParserContext,
  type NormalizedOutput,
  emptyNormalizedOutput,
} from '../types';

/**
 * No-op parser for raw Kali tool output: the bytes are already stored in MinIO
 * by scan-worker; this exists only so parser-worker can resolve a parser by name
 * and finalize the scan. It produces no normalized entities and no findings.
 */
@Injectable()
export class RawParser implements Parser {
  readonly name = 'raw';
  readonly formats: RawOutputFormat[] = ['TEXT'];

  async parse(_input: Buffer | string, _ctx: ParserContext): Promise<NormalizedOutput> {
    return emptyNormalizedOutput();
  }
}
