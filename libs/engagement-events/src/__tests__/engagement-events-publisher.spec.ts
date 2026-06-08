import {
  IoredisEngagementEventsPublisher,
  type IORedisPublishLike,
} from '../engagement-events-publisher';
import { EngagementUpdateKind } from '../types';

function makeRedis(): jest.Mocked<IORedisPublishLike> {
  return {
    publish: jest.fn().mockResolvedValue(1),
    quit: jest.fn().mockResolvedValue('OK'),
  } as jest.Mocked<IORedisPublishLike>;
}

describe('IoredisEngagementEventsPublisher', () => {
  it('publishes encoded event on the correct channel', async () => {
    const redis = makeRedis();
    const pub = new IoredisEngagementEventsPublisher(redis);
    await pub.publish({
      kind: EngagementUpdateKind.FINDING_RAISED,
      engagementId: 'eng_1',
      assetId: 'asset_1',
      ts: '2026-06-08T00:00:00.000Z',
    });
    expect(redis.publish).toHaveBeenCalledWith(
      'engagement:eng_1:updates',
      expect.stringContaining('FINDING_RAISED'),
    );
  });

  it('swallows publish errors (warn only)', async () => {
    const redis = makeRedis();
    (redis.publish as jest.Mock).mockRejectedValueOnce(new Error('boom'));
    const pub = new IoredisEngagementEventsPublisher(redis);
    await expect(
      pub.publish({
        kind: EngagementUpdateKind.CVE_ENRICHED,
        engagementId: 'eng_x',
        ts: 'now',
      }),
    ).resolves.toBeUndefined();
  });

  it('quits redis on module destroy', async () => {
    const redis = makeRedis();
    const pub = new IoredisEngagementEventsPublisher(redis);
    await pub.onModuleDestroy();
    expect(redis.quit).toHaveBeenCalled();
  });
});
