import { CloudCredentialsResolver } from '../cloud-credentials.resolver';
import { CloudProvider } from '@autoscanner/cloud-credentials';

describe('CloudCredentialsResolver', () => {
  const aws = {
    set: jest.fn(),
    list: jest.fn(),
    delete: jest.fn(),
    liveCheck: jest.fn(),
  };
  const azure = { set: jest.fn(), list: jest.fn(), delete: jest.fn(), liveCheck: jest.fn() };
  const gcp = { set: jest.fn(), list: jest.fn(), delete: jest.fn(), liveCheck: jest.fn() };
  const resolver = new CloudCredentialsResolver(aws as never, azure as never, gcp as never);

  const USER = { id: 'user-1' } as never;

  beforeEach(() => jest.clearAllMocks());

  it('setAwsCredential dispatches to AwsCredentialsService.set', async () => {
    aws.set.mockResolvedValueOnce({ ok: true, principal: 'arn:...' });
    const result = await resolver.setAwsCredential(USER, {
      accessKeyId: 'AKIA',
      secretAccessKey: 'secret',
    });
    expect(result).toEqual({ ok: true, principal: 'arn:...' });
    expect(aws.set).toHaveBeenCalledWith('user-1', {
      accessKeyId: 'AKIA',
      secretAccessKey: 'secret',
    });
  });

  it('setAzureCredential dispatches to AzureCredentialsService.set', async () => {
    azure.set.mockResolvedValueOnce({ ok: true, principal: 't/c' });
    const input = {
      tenantId: '00000000-0000-0000-0000-000000000001',
      clientId: '00000000-0000-0000-0000-000000000002',
      clientSecret: 's',
    };
    await resolver.setAzureCredential(USER, input);
    expect(azure.set).toHaveBeenCalledWith('user-1', input);
  });

  it('setGcpCredential dispatches to GcpCredentialsService.set', async () => {
    gcp.set.mockResolvedValueOnce({ ok: true, principal: 'sa@x.iam.gserviceaccount.com' });
    await resolver.setGcpCredential(USER, { serviceAccountJson: '{}' });
    expect(gcp.set).toHaveBeenCalledWith('user-1', { serviceAccountJson: '{}' });
  });

  it('deleteCloudCredential routes by provider', async () => {
    aws.delete.mockResolvedValueOnce(true);
    azure.delete.mockResolvedValueOnce(true);
    gcp.delete.mockResolvedValueOnce(true);
    expect(await resolver.deleteCloudCredential(USER, CloudProvider.AWS)).toBe(true);
    expect(await resolver.deleteCloudCredential(USER, CloudProvider.AZURE)).toBe(true);
    expect(await resolver.deleteCloudCredential(USER, CloudProvider.GCP)).toBe(true);
    expect(aws.delete).toHaveBeenCalledWith('user-1');
    expect(azure.delete).toHaveBeenCalledWith('user-1');
    expect(gcp.delete).toHaveBeenCalledWith('user-1');
  });

  it('cloudCredentialLiveCheck routes by provider', async () => {
    aws.liveCheck.mockResolvedValueOnce({ ok: true, principal: 'arn:...' });
    const out = await resolver.cloudCredentialLiveCheck(USER, CloudProvider.AWS);
    expect(out).toEqual({ ok: true, principal: 'arn:...' });
  });

  it('awsCredential query returns null when no credential exists', async () => {
    aws.list.mockResolvedValueOnce(null);
    expect(await resolver.awsCredential(USER)).toBeNull();
  });

  it('awsCredential query returns metadata when credential exists', async () => {
    aws.list.mockResolvedValueOnce({
      principal: 'arn:aws:iam::1:user/x',
      accountId: '1',
      region: 'eu-west-3',
      createdAt: new Date('2026-06-28'),
      updatedAt: new Date('2026-06-28'),
    });
    const out = await resolver.awsCredential(USER);
    expect(out?.principal).toBe('arn:aws:iam::1:user/x');
  });
});
