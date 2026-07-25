import { describe, expect, it } from 'vitest';
import { print } from 'graphql';
import {
  QUEUE_HEALTH_QUERY,
  CANCEL_ALL_SCANS_MUTATION,
  ENGAGEMENT_UPDATED_SUBSCRIPTION,
} from '../queries';

describe('cockpit graphql documents', () => {
  it('queueHealth selects the health fields', () => {
    const q = print(QUEUE_HEALTH_QUERY);
    expect(q).toContain('queueHealth');
    expect(q).toContain('waiting');
    expect(q).toContain('workers');
  });

  it('cancelAllScans takes an engagementId and returns the count', () => {
    const m = print(CANCEL_ALL_SCANS_MUTATION);
    expect(m).toContain('cancelAllScans');
    expect(m).toContain('$engagementId');
  });

  it('engagementUpdated now selects severity and title', () => {
    const s = print(ENGAGEMENT_UPDATED_SUBSCRIPTION);
    expect(s).toContain('severity');
    expect(s).toContain('title');
  });
});
