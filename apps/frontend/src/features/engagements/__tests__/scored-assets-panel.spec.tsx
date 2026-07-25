import { describe, expect, it } from 'vitest';
import { MockedProvider } from '@apollo/client/testing';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { UNIFIED_ASSETS_SCORED_QUERY, ASSET_FACETS_QUERY } from '../../../lib/graphql/queries';
import { ScoredAssetsPanel } from '../engagement-assets-tab';

const facetsMock = {
  request: { query: ASSET_FACETS_QUERY, variables: { engagementId: undefined } },
  result: {
    data: { assetFacets: { kindCounts: [], severityCounts: [], topTechs: [], scannerSources: [] } },
  },
};
const listMock = {
  request: {
    query: UNIFIED_ASSETS_SCORED_QUERY,
    variables: {
      engagementId: undefined,
      sort: 'RISK_SCORE',
      filters: { severityHas: null, techNames: null, scannerSources: null },
    },
  },
  result: {
    data: {
      unifiedAssets: [
        {
          id: 'asset-1',
          kind: 'IP_ADDRESS',
          canonicalValue: '10.0.0.1',
          displayName: '10.0.0.1',
          firstSeenAt: '2026-01-01',
          lastSeenAt: '2026-01-02',
          riskScore: 7.5,
        },
      ],
    },
  },
};

describe('<ScoredAssetsPanel /> (global scope)', () => {
  it('lists assets and navigates to the canonical /targets/:id on row click', async () => {
    render(
      <MockedProvider mocks={[facetsMock, listMock]} addTypename={false}>
        <MemoryRouter initialEntries={['/targets']}>
          <Routes>
            <Route path="/targets" element={<ScoredAssetsPanel />} />
            <Route path="/targets/:assetId" element={<div>detail asset-1</div>} />
          </Routes>
        </MemoryRouter>
      </MockedProvider>,
    );
    await waitFor(() => expect(screen.getByText('10.0.0.1')).toBeInTheDocument());
    fireEvent.click(screen.getByText('10.0.0.1'));
    await waitFor(() => expect(screen.getByText('detail asset-1')).toBeInTheDocument());
  });
});
