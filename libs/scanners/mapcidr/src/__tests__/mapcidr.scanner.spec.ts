import { MapcidrScanner } from '../mapcidr.scanner';
import type { BuildContext } from '@autoscanner/scanner-sdk';

const ctx: BuildContext = { scanJobId: 'j', engagementId: 'e', scratchDir: '/scratch' };

describe('MapcidrScanner', () => {
  it('declares name, official image, TEXT stdout → iplines-text, produces IpAddress', () => {
    expect(MapcidrScanner.name).toBe('mapcidr');
    expect(MapcidrScanner.docker.image).toBe('projectdiscovery/mapcidr:v1.1.34');
    expect(MapcidrScanner.outputs[0]).toEqual({
      format: 'TEXT',
      capture: 'stdout',
      parser: 'iplines-text',
    });
    expect(MapcidrScanner.produces).toEqual(['IpAddress']);
  });

  it('build() expands the CIDR with argv (no shell), silent', () => {
    const { cmd } = MapcidrScanner.build(MapcidrScanner.inputSchema.parse({}), '10.0.0.0/24', ctx);
    expect(cmd).toEqual(['mapcidr', '-cidr', '10.0.0.0/24', '-silent']);
  });

  it('build() adds -sample when sampleSize > 0', () => {
    const { cmd } = MapcidrScanner.build(
      MapcidrScanner.inputSchema.parse({ sampleSize: 16 }),
      '10.0.0.0/16',
      ctx,
    );
    expect(cmd).toEqual(['mapcidr', '-cidr', '10.0.0.0/16', '-silent', '-sample', '16']);
  });
});
