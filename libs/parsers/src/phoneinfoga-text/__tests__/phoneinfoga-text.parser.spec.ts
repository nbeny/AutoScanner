import { PhoneinfogaTextParser } from '../phoneinfoga-text.parser';
import type { ParserContext } from '../../types';

const ctx: ParserContext = {
  scanJobId: 'j',
  scannerName: 'phoneinfoga',
  target: '+15554443333',
  engagementId: 'e',
};

const SAMPLE = [
  '## SEED +15554443333',
  'Raw local: (555) 444-3333',
  'E164: +15554443333',
  'Country: US',
  'Carrier: Example Wireless',
].join('\n');

describe('PhoneinfogaTextParser', () => {
  it('emits one OrgMetadata record and one INFO finding per seed', async () => {
    const out = await new PhoneinfogaTextParser().parse(SAMPLE, ctx);
    expect(out.orgMetadata).toHaveLength(1);
    expect(out.orgMetadata[0].data).toMatchObject({
      number: '+15554443333',
      Country: 'US',
      Carrier: 'Example Wireless',
    });
    expect(out.findings).toHaveLength(1);
    expect(out.findings[0].severity).toBe('INFO');
    expect(out.findings[0].title).toContain('US / Example Wireless');
  });

  it('returns empty output for blank input', async () => {
    const out = await new PhoneinfogaTextParser().parse('', ctx);
    expect(out.findings).toHaveLength(0);
    expect(out.orgMetadata).toHaveLength(0);
  });
});
