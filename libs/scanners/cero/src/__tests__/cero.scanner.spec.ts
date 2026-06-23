import { CeroScanner } from '../cero.scanner';
import type { BuildContext } from '@autoscanner/scanner-sdk';

const ctx: BuildContext = { scanJobId: 'j', engagementId: 'e', scratchDir: '/scratch' };

describe('CeroScanner', () => {
  it('declares name, image, TEXT stdout → hostlines-text, produces Domain/Subdomain', () => {
    expect(CeroScanner.name).toBe('cero');
    expect(CeroScanner.docker.image).toBe('autoscanner/cero:1.0');
    expect(CeroScanner.outputs[0]).toEqual({
      format: 'TEXT',
      capture: 'stdout',
      parser: 'hostlines-text',
    });
    expect(CeroScanner.produces).toEqual(expect.arrayContaining(['Domain', 'Subdomain']));
  });

  it('build() runs cero with ports + concurrency (argv form) against the target', () => {
    const { cmd } = CeroScanner.build(
      CeroScanner.inputSchema.parse({ ports: '443,8443', concurrency: 200 }),
      '93.184.216.0/24',
      ctx,
    );
    expect(cmd).toEqual(['cero', '-p', '443,8443', '-c', '200', '93.184.216.0/24']);
  });

  it('build() defaults to port 443 and concurrency 100', () => {
    const { cmd } = CeroScanner.build(CeroScanner.inputSchema.parse({}), 'example.com', ctx);
    expect(cmd).toEqual(['cero', '-p', '443', '-c', '100', 'example.com']);
  });
});
