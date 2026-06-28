import { CloudProvider, AwsInputSchema, AzureInputSchema, GcpInputSchema } from '../types';

describe('Phase 14C-authed-infra types', () => {
  it('CloudProvider exposes AWS / AZURE / GCP', () => {
    expect(CloudProvider.AWS).toBe('AWS');
    expect(CloudProvider.AZURE).toBe('AZURE');
    expect(CloudProvider.GCP).toBe('GCP');
  });

  it('AwsInputSchema accepts minimal valid input', () => {
    expect(() =>
      AwsInputSchema.parse({
        accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
        secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      }),
    ).not.toThrow();
  });

  it('AwsInputSchema rejects empty accessKeyId', () => {
    expect(() => AwsInputSchema.parse({ accessKeyId: '', secretAccessKey: 'x' })).toThrow();
  });

  it('AzureInputSchema accepts UUIDs for tenantId and clientId', () => {
    expect(() =>
      AzureInputSchema.parse({
        tenantId: '00000000-0000-0000-0000-000000000001',
        clientId: '00000000-0000-0000-0000-000000000002',
        clientSecret: 'secret-value',
      }),
    ).not.toThrow();
  });

  it('AzureInputSchema rejects malformed tenantId', () => {
    expect(() =>
      AzureInputSchema.parse({
        tenantId: 'not-a-uuid',
        clientId: '00000000-0000-0000-0000-000000000002',
        clientSecret: 'x',
      }),
    ).toThrow();
  });

  it('GcpInputSchema requires a parseable service account JSON', () => {
    const sa = JSON.stringify({
      type: 'service_account',
      project_id: 'my-project',
      private_key: '-----BEGIN PRIVATE KEY-----\nXXXX\n-----END PRIVATE KEY-----\n',
      client_email: 'sa@my-project.iam.gserviceaccount.com',
    });
    expect(() => GcpInputSchema.parse({ serviceAccountJson: sa })).not.toThrow();
  });

  it('GcpInputSchema rejects non-JSON serviceAccountJson', () => {
    expect(() => GcpInputSchema.parse({ serviceAccountJson: 'not json' })).toThrow();
  });

  it('GcpInputSchema rejects JSON missing client_email', () => {
    const sa = JSON.stringify({ type: 'service_account', project_id: 'p' });
    expect(() => GcpInputSchema.parse({ serviceAccountJson: sa })).toThrow();
  });
});
