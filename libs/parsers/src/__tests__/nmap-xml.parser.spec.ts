import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NmapXmlParser } from '../nmap-xml.parser';
import type { ParserContext } from '../types';

const FIXTURE = readFileSync(join(__dirname, 'fixtures', 'nmap-sample.xml'), 'utf8');

const ctx: ParserContext = {
  scanJobId: 'job_1',
  scannerName: 'nmap',
  target: 'scanme.nmap.org',
  engagementId: 'eng_1',
};

describe('NmapXmlParser', () => {
  const parser = new NmapXmlParser();

  it('declares name and supported formats', () => {
    expect(parser.name).toBe('nmap-xml');
    expect(parser.formats).toEqual(['XML']);
  });

  it('parses hosts into IP + DOMAIN assets (deduped hostnames preserved as-is)', async () => {
    const out = await parser.parse(FIXTURE, ctx);
    const ips = out.assets.filter((a) => a.type === 'IP').map((a) => a.value);
    expect(ips).toEqual(['45.33.32.156', '192.0.2.1']);

    const ipAsset = out.assets.find((a) => a.value === '45.33.32.156');
    expect(ipAsset?.hostnames).toContain('scanme.nmap.org');

    const domains = out.assets.filter((a) => a.type === 'DOMAIN').map((a) => a.value);
    expect(domains).toContain('scanme.nmap.org');
  });

  it('extracts ports with state and protocol mapped to enums', async () => {
    const out = await parser.parse(FIXTURE, ctx);
    const ports = out.ports.filter((p) => p.assetValue === '45.33.32.156');
    expect(ports).toHaveLength(4);

    const p22 = ports.find((p) => p.number === 22)!;
    expect(p22).toMatchObject({ protocol: 'TCP', state: 'OPEN', reason: 'syn-ack' });

    const p443 = ports.find((p) => p.number === 443)!;
    expect(p443.state).toBe('CLOSED');

    const p123 = ports.find((p) => p.number === 123)!;
    expect(p123).toMatchObject({ protocol: 'UDP', state: 'OPEN_FILTERED' });
  });

  it('extracts services with product/version/cpe', async () => {
    const out = await parser.parse(FIXTURE, ctx);
    const ssh = out.services.find((s) => s.portNumber === 22)!;
    expect(ssh).toMatchObject({
      name: 'ssh',
      product: 'OpenSSH',
      version: '6.6.1p1 Ubuntu 2ubuntu2.13',
      confidence: 10,
    });
    expect(ssh.cpe).toEqual(['cpe:/a:openbsd:openssh:6.6.1p1', 'cpe:/o:linux:linux_kernel']);

    const http = out.services.find((s) => s.portNumber === 80)!;
    expect(http.product).toBe('Apache httpd');
    expect(http.cpe).toEqual(['cpe:/a:apache:http_server:2.4.7']);
  });

  it('returns empty NormalizedOutput for empty input', async () => {
    const out = await parser.parse('', ctx);
    expect(out.assets).toEqual([]);
    expect(out.ports).toEqual([]);
    expect(out.services).toEqual([]);
  });
});
