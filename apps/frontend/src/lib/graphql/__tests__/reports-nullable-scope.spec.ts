import { describe, expect, it } from 'vitest';
import { print } from 'graphql';
import { REPORTS_QUERY } from '../queries';

describe('REPORTS_QUERY accepts an optional engagement scope', () => {
  it('declares $engagementId as nullable', () => {
    const q = print(REPORTS_QUERY);
    expect(q).toContain('$engagementId: ID');
    expect(q).not.toContain('$engagementId: ID!');
  });
});
