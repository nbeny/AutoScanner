import { XMLParser } from 'fast-xml-parser';
import type {
  NormalizedOutput,
  NormalizedPort,
  NormalizedService,
  Parser,
  ParserContext,
  PortState,
  Protocol,
} from './types';
import { emptyNormalizedOutput } from './types';

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

function mapProtocol(p: string | undefined): Protocol {
  switch ((p ?? '').toLowerCase()) {
    case 'tcp':
      return 'TCP';
    case 'udp':
      return 'UDP';
    case 'icmp':
      return 'ICMP';
    case 'sctp':
      return 'SCTP';
    default:
      return 'TCP';
  }
}

function mapPortState(s: string | undefined): PortState {
  switch ((s ?? '').toLowerCase()) {
    case 'open':
      return 'OPEN';
    case 'closed':
      return 'CLOSED';
    case 'filtered':
      return 'FILTERED';
    case 'open|filtered':
      return 'OPEN_FILTERED';
    case 'unfiltered':
      return 'UNFILTERED';
    default:
      return 'FILTERED';
  }
}

interface NmapAddress {
  '@_addr': string;
  '@_addrtype': 'ipv4' | 'ipv6' | 'mac';
}

interface NmapHostname {
  '@_name': string;
  '@_type'?: string;
}

interface NmapPort {
  '@_protocol': string;
  '@_portid': string;
  state?: { '@_state': string; '@_reason'?: string };
  service?: {
    '@_name'?: string;
    '@_product'?: string;
    '@_version'?: string;
    '@_extrainfo'?: string;
    '@_conf'?: string;
    cpe?: string | string[];
  };
}

interface NmapHost {
  status?: { '@_state': string };
  address: NmapAddress | NmapAddress[];
  hostnames?: { hostname?: NmapHostname | NmapHostname[] };
  ports?: { port?: NmapPort | NmapPort[] };
}

interface NmapRunRoot {
  nmaprun?: { host?: NmapHost | NmapHost[] };
}

function pickIp(addrs: NmapAddress[]): string | undefined {
  return (
    addrs.find((a) => a['@_addrtype'] === 'ipv4')?.['@_addr'] ??
    addrs.find((a) => a['@_addrtype'] === 'ipv6')?.['@_addr']
  );
}

export class NmapXmlParser implements Parser {
  readonly name = 'nmap-xml';
  readonly formats = ['XML'] as const satisfies Parser['formats'];

  async parse(input: Buffer | string, _ctx: ParserContext): Promise<NormalizedOutput> {
    const text = Buffer.isBuffer(input) ? input.toString('utf8') : input;
    const out = emptyNormalizedOutput();
    if (!text.trim()) return out;

    const parsed = xmlParser.parse(text) as NmapRunRoot;
    const hosts = toArray(parsed.nmaprun?.host);

    for (const host of hosts) {
      const addrs = toArray(host.address);
      const ip = pickIp(addrs);
      if (!ip) continue;

      const hostnames = toArray(host.hostnames?.hostname)
        .map((h) => h['@_name'])
        .filter((n): n is string => Boolean(n));

      out.assets.push({
        type: 'IP',
        value: ip,
        hostnames: hostnames.length ? hostnames : undefined,
      });
      for (const name of hostnames) {
        out.assets.push({ type: 'DOMAIN', value: name.toLowerCase() });
      }

      for (const port of toArray(host.ports?.port)) {
        const protocol = mapProtocol(port['@_protocol']);
        const number = Number.parseInt(port['@_portid'], 10);
        if (!Number.isFinite(number)) continue;

        const portRecord: NormalizedPort = {
          assetValue: ip,
          number,
          protocol,
          state: mapPortState(port.state?.['@_state']),
          reason: port.state?.['@_reason'],
        };
        out.ports.push(portRecord);

        const svc = port.service;
        if (svc && (svc['@_name'] || svc['@_product'])) {
          const cpe = toArray(svc.cpe);
          const service: NormalizedService = {
            assetValue: ip,
            portNumber: number,
            protocol,
            name: svc['@_name'],
            product: svc['@_product'],
            version: svc['@_version'],
            extraInfo: svc['@_extrainfo'],
            cpe: cpe.length ? cpe : undefined,
            confidence: svc['@_conf'] ? Number.parseInt(svc['@_conf'], 10) : undefined,
          };
          out.services.push(service);
        }
      }
    }

    return out;
  }
}
