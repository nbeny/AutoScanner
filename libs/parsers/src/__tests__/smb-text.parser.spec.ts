import { SmbTextParser } from '../smb-text';
import type { ParserContext } from '../types';

const ctx: ParserContext = {
  scanJobId: 'j',
  scannerName: 'smb-enum',
  target: '10.0.0.5',
  engagementId: 'e',
};

describe('SmbTextParser', () => {
  const parser = new SmbTextParser();

  it('emits a null-session Finding and OS OrgMetadata', async () => {
    const text = [
      "[+] Server allows session using username '', password ''",
      'OS: Windows Server 2019',
      'Sharename: ADMIN$  Type: Disk',
    ].join('\n');
    const out = await parser.parse(text, ctx);
    expect(out.findings.some((f) => /null session|anonymous/i.test(f.title))).toBe(true);
    expect(out.orgMetadata.some((m) => m.kind === 'OTHER')).toBe(true);
  });

  it('tolerant of blank/garbage', async () => {
    expect((await parser.parse('', ctx)).findings).toHaveLength(0);
  });
});
