import { CorsyScanner } from '../corsy.scanner';
import type { BuildContext } from '@autoscanner/scanner-sdk';

const ctx: BuildContext = { scanJobId: 'j', engagementId: 'e', scratchDir: '/scratch' };

describe('CorsyScanner', () => {
  it('declares name, image, JSON file → corsy-json, produces Finding', () => {
    expect(CorsyScanner.name).toBe('corsy');
    expect(CorsyScanner.docker.image).toBe('autoscanner/corsy:1.0');
    expect(CorsyScanner.outputs[0]).toEqual({
      format: 'JSON',
      capture: { path: '/out/result.json' },
      parser: 'corsy-json',
    });
    expect(CorsyScanner.produces).toEqual(['Finding']);
  });

  it('build() writes URLs to /tmp/urls.txt via sh -c and runs corsy with threads=8 default', () => {
    const input = CorsyScanner.inputSchema.parse({ urls: ['https://a/', 'https://b/'] });
    const { cmd } = CorsyScanner.build(input, 'https://a/', ctx);
    expect(cmd[0]).toBe('sh');
    expect(cmd[1]).toBe('-lc');
    expect(cmd[2]).toContain("printf '%s\\n' 'https://a/' 'https://b/' > /tmp/urls.txt");
    expect(cmd[2]).toContain('corsy -i /tmp/urls.txt -t 8 -o /out/result.json');
  });

  it('build() falls back to target when urls is empty', () => {
    const input = CorsyScanner.inputSchema.parse({});
    const { cmd } = CorsyScanner.build(input, 'https://only/', ctx);
    expect(cmd[2]).toContain("'https://only/'");
  });

  it('build() appends -H K: V per header', () => {
    const input = CorsyScanner.inputSchema.parse({
      urls: ['https://a/'],
      headers: { Authorization: 'Bearer x', 'X-Trace': '1' },
    });
    const { cmd } = CorsyScanner.build(input, 'https://a/', ctx);
    expect(cmd[2]).toContain("-H 'Authorization: Bearer x'");
    expect(cmd[2]).toContain("-H 'X-Trace: 1'");
  });

  it('rejects threads > 32 via zod', () => {
    expect(() => CorsyScanner.inputSchema.parse({ threads: 100 })).toThrow();
  });
});
