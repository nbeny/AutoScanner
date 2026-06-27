import { LinkfinderScanner } from '../linkfinder.scanner';
import type { BuildContext } from '@autoscanner/scanner-sdk';

const ctx: BuildContext = { scanJobId: 'j', engagementId: 'e', scratchDir: '/scratch' };

describe('LinkfinderScanner', () => {
  it('declares name, image, TEXT stdout → linkfinder-text, produces Endpoint', () => {
    expect(LinkfinderScanner.name).toBe('linkfinder');
    expect(LinkfinderScanner.docker.image).toBe('autoscanner/linkfinder:1.0');
    expect(LinkfinderScanner.docker.readonlyRootfs).toBe(true);
    expect(LinkfinderScanner.docker.network).toBe('bridge');
    expect(LinkfinderScanner.docker.capabilities).toEqual([]);
    expect(LinkfinderScanner.outputs[0]).toEqual({
      format: 'TEXT',
      capture: 'stdout',
      parser: 'linkfinder-text',
    });
    expect(LinkfinderScanner.produces).toEqual(['Endpoint']);
  });

  it('build() invokes linkfinder against the JS URL in cli output mode', () => {
    const input = LinkfinderScanner.inputSchema.parse({});
    const { cmd } = LinkfinderScanner.build(input, 'https://acme.tld/static/app.js', ctx);
    expect(cmd[0]).toBe('python');
    expect(cmd).toContain('/opt/linkfinder/linkfinder.py');
    expect(cmd).toContain('-i');
    expect(cmd).toContain('https://acme.tld/static/app.js');
    expect(cmd).toContain('-o');
    expect(cmd).toContain('cli');
  });

  it('build() emits -o html when outputFormat is html', () => {
    const input = LinkfinderScanner.inputSchema.parse({ outputFormat: 'html' });
    const { cmd } = LinkfinderScanner.build(input, 'https://acme.tld/x.js', ctx);
    expect(cmd).toContain('-o');
    expect(cmd).toContain('html');
    expect(cmd).not.toContain('-d');
  });

  it('rejects unsupported output formats via zod', () => {
    expect(() => LinkfinderScanner.inputSchema.parse({ outputFormat: 'pdf' })).toThrow();
  });
});
