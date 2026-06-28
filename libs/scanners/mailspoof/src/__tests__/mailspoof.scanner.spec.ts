import { MailspoofScanner } from '../mailspoof.scanner';
import type { BuildContext } from '@autoscanner/scanner-sdk';

const ctx: BuildContext = { scanJobId: 'j', engagementId: 'e', scratchDir: '/scratch' };

describe('MailspoofScanner', () => {
  it('declares name, image, JSON stdout → mailspoof-json, produces OrgMetadata + Finding', () => {
    expect(MailspoofScanner.name).toBe('mailspoof');
    expect(MailspoofScanner.docker.image).toBe('autoscanner/mailspoof:1.0');
    expect(MailspoofScanner.docker.readonlyRootfs).toBe(true);
    expect(MailspoofScanner.docker.network).toBe('bridge');
    expect(MailspoofScanner.docker.capabilities).toEqual([]);
    expect(MailspoofScanner.outputs[0]).toEqual({
      format: 'JSON',
      capture: 'stdout',
      parser: 'mailspoof-json',
    });
    expect(MailspoofScanner.produces).toEqual(['OrgMetadata', 'Finding']);
  });

  it('build() runs mailspoof.py with -d <target> -o json', () => {
    const input = MailspoofScanner.inputSchema.parse({});
    const { cmd } = MailspoofScanner.build(input, 'acme.tld', ctx);
    expect(cmd).toEqual(['python', '/opt/mailspoof/mailspoof.py', '-d', 'acme.tld', '-o', 'json']);
  });
});
