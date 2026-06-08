import {
  decodeEngagementEvent,
  encodeEngagementEvent,
  engagementChannel,
  EngagementUpdateKind,
} from '../types';

describe('engagementChannel', () => {
  it('formats channel as engagement:<id>:updates', () => {
    expect(engagementChannel('eng_1')).toBe('engagement:eng_1:updates');
  });
});

describe('encode/decode', () => {
  it('round-trips a valid event', () => {
    const ev = {
      kind: EngagementUpdateKind.ASSET_ADDED,
      engagementId: 'eng_1',
      assetId: 'asset_1',
      ts: '2026-06-08T10:00:00.000Z',
    };
    expect(decodeEngagementEvent(encodeEngagementEvent(ev))).toEqual(ev);
  });

  it('throws on malformed payload (missing kind)', () => {
    expect(() => decodeEngagementEvent('{}')).toThrow(/Invalid/);
  });

  it('throws on malformed payload (not an object)', () => {
    expect(() => decodeEngagementEvent('null')).toThrow(/Invalid/);
  });
});
