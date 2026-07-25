import { describe, expect, it } from 'vitest';
import { print } from 'graphql';
import { UNIFIED_ASSETS_SCORED_QUERY, ASSET_FACETS_QUERY } from '../queries';

describe('asset queries accept an optional engagement scope', () => {
  it('UnifiedAssetsScored declares $engagementId as nullable', () => {
    const q = print(UNIFIED_ASSETS_SCORED_QUERY);
    expect(q).toContain('$engagementId: ID');
    expect(q).not.toContain('$engagementId: ID!');
  });

  it('AssetFacets declares $engagementId as nullable', () => {
    const q = print(ASSET_FACETS_QUERY);
    expect(q).toContain('$engagementId: ID');
    expect(q).not.toContain('$engagementId: ID!');
  });
});
