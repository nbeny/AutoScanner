import { NmapScanner } from '../nmap.scanner';
import type { BuildContext } from '@autoscanner/scanner-sdk';

const ctx: BuildContext = {
  scanJobId: 'job_1',
  engagementId: 'eng_1',
  scratchDir: '/tmp/scratch',
};

describe('NmapScanner', () => {
  it('declares name, docker, outputs, produces per spec', () => {
    expect(NmapScanner.name).toBe('nmap');
    expect(NmapScanner.docker.image).toBe('instrumentisto/nmap:7.98-r2');
    expect(NmapScanner.docker.network).toBe('host');
    expect(NmapScanner.docker.capabilities).toEqual(['NET_RAW', 'NET_ADMIN', 'NET_BIND_SERVICE']);
    expect(NmapScanner.outputs[0]).toEqual({
      format: 'XML',
      capture: 'stdout',
      parser: 'nmap-xml',
    });
    expect(NmapScanner.produces).toContain('Port');
  });

  it('inputSchema applies defaults', () => {
    const parsed = NmapScanner.inputSchema.parse({});
    expect(parsed).toMatchObject({
      ports: '1-1000',
      serviceDetection: true,
      osDetection: false,
      timingTemplate: 4,
      scripts: [],
      customArgs: [],
    });
  });

  it('build() emits nmap -oX - with target and port range', () => {
    const input = NmapScanner.inputSchema.parse({});
    const { cmd } = NmapScanner.build(input, '127.0.0.1', ctx);
    expect(cmd[0]).toBe('nmap');
    expect(cmd).toEqual(
      expect.arrayContaining(['-oX', '-', '-Pn', '-T4', '-sV', '-p', '1-1000', '127.0.0.1']),
    );
    expect(cmd[cmd.length - 1]).toBe('127.0.0.1');
  });

  it('build() includes --script and customArgs when set', () => {
    const input = NmapScanner.inputSchema.parse({
      scripts: ['http-title', 'ssl-cert'],
      customArgs: ['--reason'],
      osDetection: true,
    });
    const { cmd } = NmapScanner.build(input, 'example.com', ctx);
    expect(cmd).toContain('-O');
    expect(cmd).toContain('--script');
    expect(cmd).toContain('http-title,ssl-cert');
    expect(cmd).toContain('--reason');
  });

  it('rejects out-of-range timingTemplate', () => {
    expect(() => NmapScanner.inputSchema.parse({ timingTemplate: 7 })).toThrow();
  });
});
