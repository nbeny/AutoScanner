import { provisionTopics } from './provision';
import { allProvisionSpecs } from '../topics';

describe('provisionTopics', () => {
  it('creates only missing topics', async () => {
    const admin = {
      connect: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn().mockResolvedValue(undefined),
      listTopics: jest.fn().mockResolvedValue(['security.report.requested']),
      createTopics: jest.fn().mockResolvedValue(true),
    };
    await provisionTopics(admin as any, 1);
    const created = admin.createTopics.mock.calls[0][0].topics.map((t: any) => t.topic);
    expect(created).not.toContain('security.report.requested');
    expect(created.length).toBe(allProvisionSpecs().length - 1);
  });

  it('skips createTopics entirely when nothing is missing', async () => {
    const all = allProvisionSpecs().map((s) => s.topic);
    const admin = {
      connect: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn().mockResolvedValue(undefined),
      listTopics: jest.fn().mockResolvedValue(all),
      createTopics: jest.fn().mockResolvedValue(true),
    };
    await provisionTopics(admin as any, 1);
    expect(admin.createTopics).not.toHaveBeenCalled();
  });
});
