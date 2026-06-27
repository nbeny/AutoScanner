import { GraphqlCopScanner } from '../graphql-cop.scanner';
import type { BuildContext } from '@autoscanner/scanner-sdk';

const ctx: BuildContext = { scanJobId: 'j', engagementId: 'e', scratchDir: '/scratch' };

describe('GraphqlCopScanner', () => {
  it('declares name, image, JSON stdout → graphql-cop-json, produces Finding', () => {
    expect(GraphqlCopScanner.name).toBe('graphql-cop');
    expect(GraphqlCopScanner.docker.image).toBe('autoscanner/graphql-cop:1.0');
    expect(GraphqlCopScanner.outputs[0]).toEqual({
      format: 'JSON',
      capture: 'stdout',
      parser: 'graphql-cop-json',
    });
    expect(GraphqlCopScanner.produces).toEqual(['Finding']);
  });

  it('build() invokes graphql-cop with -t target -o json', () => {
    const input = GraphqlCopScanner.inputSchema.parse({});
    const { cmd } = GraphqlCopScanner.build(input, 'https://acme.tld/graphql', ctx);
    expect(cmd[0]).toBe('python');
    expect(cmd).toContain('/opt/graphql-cop/graphql-cop.py');
    expect(cmd).toContain('-t');
    expect(cmd).toContain('https://acme.tld/graphql');
    expect(cmd).toContain('-o');
    expect(cmd).toContain('json');
  });

  it('build() appends -H K: V per header', () => {
    const input = GraphqlCopScanner.inputSchema.parse({
      headers: { Authorization: 'Bearer x' },
    });
    const { cmd } = GraphqlCopScanner.build(input, 'https://a/g', ctx);
    expect(cmd).toContain('-H');
    expect(cmd).toContain('Authorization: Bearer x');
  });
});
