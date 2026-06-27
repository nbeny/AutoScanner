import { JsluiceScanner } from '../jsluice.scanner';
import type { BuildContext } from '@autoscanner/scanner-sdk';

const ctx: BuildContext = { scanJobId: 'j', engagementId: 'e', scratchDir: '/scratch' };

describe('JsluiceScanner', () => {
  it('declares name, image, JSONL stdout → jsluice-jsonl, produces Endpoint + Finding', () => {
    expect(JsluiceScanner.name).toBe('jsluice');
    expect(JsluiceScanner.docker.image).toBe('autoscanner/jsluice:1.0');
    expect(JsluiceScanner.docker.readonlyRootfs).toBe(true);
    expect(JsluiceScanner.outputs[0]).toEqual({
      format: 'JSONL',
      capture: 'stdout',
      parser: 'jsluice-jsonl',
    });
    expect(JsluiceScanner.produces).toEqual(['Endpoint', 'Finding']);
  });

  it('build() runs urls + secrets sub-commands when both flags default to true', () => {
    const input = JsluiceScanner.inputSchema.parse({});
    const { cmd } = JsluiceScanner.build(input, 'https://acme.tld/app.js', ctx);
    expect(cmd[0]).toBe('sh');
    expect(cmd[1]).toBe('-lc');
    expect(cmd[2]).toContain("printf '%s\\n' 'https://acme.tld/app.js'");
    expect(cmd[2]).toContain('jsluice urls');
    expect(cmd[2]).toContain('jsluice secrets');
  });

  it('build() runs only urls sub-command when extractSecrets=false', () => {
    const input = JsluiceScanner.inputSchema.parse({ extractSecrets: false });
    const { cmd } = JsluiceScanner.build(input, 'https://acme.tld/app.js', ctx);
    expect(cmd[2]).toContain('jsluice urls');
    expect(cmd[2]).not.toContain('jsluice secrets');
  });

  it('build() runs only secrets sub-command when extractUrls=false', () => {
    const input = JsluiceScanner.inputSchema.parse({ extractUrls: false });
    const { cmd } = JsluiceScanner.build(input, 'https://acme.tld/app.js', ctx);
    expect(cmd[2]).toContain('jsluice secrets');
    expect(cmd[2]).not.toContain('jsluice urls');
  });
});
