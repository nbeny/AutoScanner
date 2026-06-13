import { Injectable } from '@nestjs/common';
import type { RawOutputFormat } from '@autoscanner/scanner-sdk';
import type { NormalizedOutput, Parser, ParserContext } from '../types';
import { emptyNormalizedOutput } from '../types';

interface WhatwebPlugin {
  version?: string[];
  string?: string[];
}

interface WhatwebEntry {
  target?: string;
  http_status?: number;
  plugins?: Record<string, WhatwebPlugin>;
}

@Injectable()
export class WhatwebJsonParser implements Parser {
  readonly name = 'whatweb-json';
  readonly formats: RawOutputFormat[] = ['JSON'];

  async parse(input: Buffer | string, _ctx: ParserContext): Promise<NormalizedOutput> {
    const out = emptyNormalizedOutput();
    const text = typeof input === 'string' ? input : input.toString('utf8');

    let entries: WhatwebEntry[];
    try {
      entries = JSON.parse(text) as WhatwebEntry[];
    } catch {
      return out;
    }

    if (!Array.isArray(entries)) return out;

    for (const entry of entries) {
      const rawTarget = entry.target ?? '';
      let host: string;
      try {
        host = new URL(rawTarget).hostname;
      } catch {
        host = rawTarget;
      }

      const plugins = entry.plugins ?? {};
      for (const pluginName of Object.keys(plugins)) {
        const plugin = plugins[pluginName];
        const version = plugin?.version?.[0];
        out.technologies.push({
          assetValue: host,
          name: pluginName,
          ...(version !== undefined ? { version } : {}),
        });
      }
    }

    return out;
  }
}
