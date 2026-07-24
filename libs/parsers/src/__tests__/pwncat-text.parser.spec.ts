import { PwncatTextParser } from '../pwncat-text/pwncat-text.parser';
import type { ParserContext } from '../types';

const ctx: ParserContext = {
  scanJobId: 'j1',
  scannerName: 'pwncat',
  target: '10.0.0.5',
  engagementId: 'e1',
};

describe('PwncatTextParser', () => {
  const parser = new PwncatTextParser();

  it('declares name and TEXT format', () => {
    expect(parser.name).toBe('pwncat-text');
    expect(parser.formats).toEqual(['TEXT']);
  });

  it('emits one HIGH finding when output shows command execution (uid=0)', async () => {
    const transcript = 'uid=0(root) gid=0(root) groups=0(root)';
    const out = await parser.parse(transcript, ctx);
    expect(out.findings).toHaveLength(1);
    expect(out.findings[0].severity).toBe('HIGH');
    expect(out.findings[0].location).toBe('10.0.0.5');
    expect(out.findings[0].title.toLowerCase()).toContain('command execution');
  });

  it('emits no findings for a benign service banner', async () => {
    const transcript = 'SSH-2.0-OpenSSH_8.9p1 Ubuntu-3ubuntu0.1';
    const out = await parser.parse(transcript, ctx);
    expect(out.findings).toHaveLength(0);
  });

  it('emits no findings for empty output', async () => {
    const out = await parser.parse('', ctx);
    expect(out.findings).toHaveLength(0);
  });
});
