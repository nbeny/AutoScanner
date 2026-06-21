import { EngagementUpdateKind } from '../types';

describe('EngagementUpdateKind', () => {
  it('includes the scan job status change kind', () => {
    expect(EngagementUpdateKind.SCAN_JOB_STATUS_CHANGED).toBe('SCAN_JOB_STATUS_CHANGED');
  });
});
