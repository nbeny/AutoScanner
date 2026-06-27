import { RustscanScanner } from '../rustscan.scanner';
import type { BuildContext } from '@autoscanner/scanner-sdk';

const ctx: BuildContext = { scanJobId: 'j', engagementId: 'e', scratchDir: '/scratch' };

describe('RustscanScanner', () => {
  it('declares pinned image, bridge net, readonlyRootfs, no caps', () => {
    expect(RustscanScanner.name).toBe('rustscan');
    expect(RustscanScanner.docker.image).toBe('autoscanner/rustscan:1.0');
    expect(RustscanScanner.docker.network).toBe('bridge');
    expect(RustscanScanner.docker.capabilities).toEqual([]);
    expect(RustscanScanner.docker.readonlyRootfs).toBe(true);
    expect(RustscanScanner.docker.defaultTimeoutMs).toBe(900_000);
  });

  it('outputs greppable TEXT routed to rustscan-greppable parser, produces Asset+Port', () => {
    expect(RustscanScanner.outputs[0]).toEqual({
      format: 'TEXT',
      capture: 'stdout',
      parser: 'rustscan-greppable',
    });
    expect(RustscanScanner.produces).toEqual(['Asset', 'Port']);
  });

  it('build() emits --greppable + --no-banner with default ulimit/batchSize', () => {
    const input = RustscanScanner.inputSchema.parse({});
    const { cmd } = RustscanScanner.build(input, '10.0.0.1', ctx);
    expect(cmd).toEqual([
      'rustscan',
      '-a',
      '10.0.0.1',
      '-r',
      '1-65535',
      '-b',
      '4500',
      '-u',
      '5000',
      '--no-banner',
      '--greppable',
    ]);
  });

  it('build() honors custom ports/batchSize/ulimit', () => {
    const input = RustscanScanner.inputSchema.parse({
      ports: '80,443',
      batchSize: 1000,
      ulimit: 2000,
    });
    const { cmd } = RustscanScanner.build(input, '10.0.0.2', ctx);
    expect(cmd).toContain('80,443');
    expect(cmd).toContain('1000');
    expect(cmd).toContain('2000');
  });

  it('rejects non-positive batchSize via Zod', () => {
    expect(() => RustscanScanner.inputSchema.parse({ batchSize: 0 })).toThrow();
  });
});
