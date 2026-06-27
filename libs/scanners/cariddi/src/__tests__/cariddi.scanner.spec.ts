import { CariddiScanner } from '../cariddi.scanner';
import type { BuildContext } from '@autoscanner/scanner-sdk';

const ctx: BuildContext = { scanJobId: 'j', engagementId: 'e', scratchDir: '/scratch' };

describe('CariddiScanner', () => {
  it('declares name, image, JSON stdout → cariddi-json, produces Finding+Endpoint', () => {
    expect(CariddiScanner.name).toBe('cariddi');
    expect(CariddiScanner.docker.image).toBe('autoscanner/cariddi:1.0');
    expect(CariddiScanner.outputs[0]).toEqual({
      format: 'JSON',
      capture: 'stdout',
      parser: 'cariddi-json',
    });
    expect(CariddiScanner.produces).toEqual(['Finding', 'Endpoint']);
  });

  it('build() pipes urls list on stdin and enables -s -e -info -err -json', () => {
    const input = CariddiScanner.inputSchema.parse({ urls: ['https://a/', 'https://b/'] });
    const { cmd, stdin } = CariddiScanner.build(input, 'https://a/', ctx);
    expect(cmd).toEqual(['cariddi', '-s', '-e', '-info', '-err', '-json']);
    expect(stdin).toBe('https://a/\nhttps://b/\n');
  });

  it('build() falls back to target when urls is empty', () => {
    const input = CariddiScanner.inputSchema.parse({});
    const { stdin } = CariddiScanner.build(input, 'https://only/', ctx);
    expect(stdin).toBe('https://only/\n');
  });

  it('build() mounts customSecretsFile bind and adds -sf when provided', () => {
    const input = CariddiScanner.inputSchema.parse({
      urls: ['https://a/'],
      customSecretsFile: '/host/path/secrets.json',
    });
    const { cmd, binds } = CariddiScanner.build(input, 'https://a/', ctx);
    expect(cmd).toContain('-sf');
    expect(cmd).toContain('/etc/cariddi/custom-secrets.json');
    expect(binds).toEqual([
      { src: '/host/path/secrets.json', dst: '/etc/cariddi/custom-secrets.json', readonly: true },
    ]);
  });

  it('rejects malformed URL via zod', () => {
    expect(() => CariddiScanner.inputSchema.parse({ urls: ['not a url'] })).toThrow();
  });
});
