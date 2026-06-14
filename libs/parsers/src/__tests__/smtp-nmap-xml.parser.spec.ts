import { SmtpNmapXmlParser } from '../smtp-nmap-xml';
import type { NormalizedOrgMetadata, ParserContext } from '../types';
const ctx: ParserContext = {
  scanJobId: 'j',
  scannerName: 'smtp-recon',
  target: 'mail.example.com',
  engagementId: 'e',
};
describe('SmtpNmapXmlParser', () => {
  const parser = new SmtpNmapXmlParser();
  it('emits an open-relay Finding (HIGH) and a capabilities OrgMetadata', async () => {
    const xml = `<?xml version="1.0"?><nmaprun><host><address addr="1.2.3.4" addrtype="ipv4"/>
      <ports><port protocol="tcp" portid="25"><state state="open"/>
        <script id="smtp-open-relay" output="Server is an open relay (16/16 tests)"/>
        <script id="smtp-commands" output="mail.example.com, PIPELINING, SIZE 10240000, STARTTLS, 8BITMIME"/>
      </port></ports></host></nmaprun>`;
    const out = await parser.parse(xml, ctx);
    const relay = out.findings.find((f) => f.title.toLowerCase().includes('open relay'));
    expect(relay?.severity).toBe('HIGH');
    expect(out.orgMetadata.some((m: NormalizedOrgMetadata) => m.kind === 'OTHER')).toBe(true);
  });
  it('returns empty on blank/garbage', async () => {
    expect((await parser.parse('', ctx)).findings).toHaveLength(0);
    expect((await parser.parse('not xml', ctx)).findings).toHaveLength(0);
  });
});
