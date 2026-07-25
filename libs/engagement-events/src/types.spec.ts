import {
  EngagementUpdateKind,
  encodeEngagementEvent,
  decodeEngagementEvent,
  type EngagementUpdateEvent,
} from './types';

describe('engagement event encode/decode', () => {
  it('round-trips a FINDING_RAISED event carrying severity and title', () => {
    const ev: EngagementUpdateEvent = {
      kind: EngagementUpdateKind.FINDING_RAISED,
      engagementId: 'eng-1',
      assetId: 'asset-1',
      severity: 'CRITICAL',
      title: 'SQL injection in /login',
      ts: '2026-07-25T00:00:00.000Z',
    };
    const decoded = decodeEngagementEvent(encodeEngagementEvent(ev));
    expect(decoded.severity).toBe('CRITICAL');
    expect(decoded.title).toBe('SQL injection in /login');
    expect(decoded.kind).toBe(EngagementUpdateKind.FINDING_RAISED);
  });

  it('still decodes events without the optional finding fields', () => {
    const ev: EngagementUpdateEvent = {
      kind: EngagementUpdateKind.ASSET_ADDED,
      engagementId: 'eng-1',
      assetId: 'asset-1',
      ts: '2026-07-25T00:00:00.000Z',
    };
    const decoded = decodeEngagementEvent(encodeEngagementEvent(ev));
    expect(decoded.severity).toBeUndefined();
    expect(decoded.title).toBeUndefined();
  });
});
