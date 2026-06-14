import { Injectable } from '@nestjs/common';
import { XMLParser } from 'fast-xml-parser';
import type { RawOutputFormat } from '@autoscanner/scanner-sdk';
import type { NormalizedOutput, Parser, ParserContext } from '../types';
import { emptyNormalizedOutput } from '../types';

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseAttributeValue: false,
  trimValues: true,
});

function toArray<T>(v: T | T[] | undefined): T[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

interface NmapScript {
  '@_id': string;
  '@_output': string;
}

interface NmapPort {
  '@_protocol': string;
  '@_portid': string;
  state?: { '@_state': string };
  script?: NmapScript | NmapScript[];
}

interface NmapAddress {
  '@_addr': string;
  '@_addrtype': string;
}

interface NmapHost {
  address?: NmapAddress | NmapAddress[];
  ports?: { port?: NmapPort | NmapPort[] };
}

interface NmapRunRoot {
  nmaprun?: { host?: NmapHost | NmapHost[] };
}

@Injectable()
export class SmtpNmapXmlParser implements Parser {
  readonly name = 'smtp-nmap-xml';
  readonly formats: RawOutputFormat[] = ['XML'];

  async parse(input: Buffer | string, ctx: ParserContext): Promise<NormalizedOutput> {
    const out = emptyNormalizedOutput();
    const text = Buffer.isBuffer(input) ? input.toString('utf8') : input;
    if (!text.trim()) return out;

    try {
      const parsed = xmlParser.parse(text) as NmapRunRoot;
      const hosts = toArray(parsed.nmaprun?.host);

      for (const host of hosts) {
        const addrs = toArray(host.address);
        const ipAddr =
          addrs.find((a) => a['@_addrtype'] === 'ipv4')?.['@_addr'] ??
          addrs[0]?.['@_addr'] ??
          ctx.target;

        for (const port of toArray(host.ports?.port)) {
          const portId = port['@_portid'];
          const location = `${ipAddr}:${portId}`;
          const scripts = toArray(port.script);

          for (const script of scripts) {
            const id = script['@_id'];
            const output = script['@_output'] ?? '';

            if (
              id === 'smtp-open-relay' &&
              output.toLowerCase().includes('server is an open relay')
            ) {
              out.findings.push({
                scannerName: ctx.scannerName,
                title: 'SMTP open relay',
                severity: 'HIGH',
                location,
                description: output,
              });
            } else if (id === 'smtp-commands') {
              out.orgMetadata.push({
                kind: 'OTHER',
                data: { smtpCapabilities: output, host: ipAddr },
              });
            } else if (id === 'smtp-enum-users' && output.trim()) {
              out.findings.push({
                scannerName: ctx.scannerName,
                title: 'SMTP user enumeration',
                severity: 'LOW',
                location,
                description: output,
              });
            }
          }
        }
      }
    } catch {
      return emptyNormalizedOutput();
    }

    return out;
  }
}
