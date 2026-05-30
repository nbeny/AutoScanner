import { describe, expect, it } from 'vitest';
import { MockedProvider } from '@apollo/client/testing';
import { render, screen } from '@testing-library/react';
import { ASSETS_BY_TYPE_QUERY, ASSET_TECHNOLOGIES_QUERY } from '../../../lib/graphql/queries';
import { EngagementAssetsTab } from '../engagement-assets-tab';

const engagementId = 'eng_1';

// Each tab now issues a server-side-filtered query, so the mocks must match
// the exact `types` variable the tab sends. This also proves the over-fetch
// fix is in place — a tab that asked for the wrong types would miss its mock
// and surface a fetch error instead of silently filtering client-side.
function byTypeMock(
  types: string[],
  assets: Array<{
    id: string;
    value: string;
    type: string;
    lastSeenAt: string;
  }>,
) {
  return {
    request: { query: ASSETS_BY_TYPE_QUERY, variables: { engagementId, types } },
    result: { data: { assets } },
  };
}

const technologiesMock = {
  request: { query: ASSET_TECHNOLOGIES_QUERY, variables: { engagementId } },
  result: {
    data: {
      assets: [
        {
          id: 'a_tech_host',
          technologies: [
            { id: 't_1', name: 'nginx', version: '1.21.0' },
            { id: 't_2', name: 'React', version: '18.2.0' },
            // Duplicate of t_2 from a sibling asset — should collapse client-side.
            { id: 't_dup', name: 'React', version: '18.2.0' },
          ],
        },
      ],
    },
  },
};

function renderTab(
  kind: 'DOMAIN' | 'SUBDOMAIN' | 'IP' | 'TECHNOLOGY',
  mocks: Parameters<typeof MockedProvider>[0]['mocks'],
) {
  return render(
    <MockedProvider mocks={mocks}>
      <EngagementAssetsTab engagementId={engagementId} kind={kind} />
    </MockedProvider>,
  );
}

describe('<EngagementAssetsTab />', () => {
  it('queries with types=[DOMAIN] and renders the domain rows', async () => {
    renderTab('DOMAIN', [
      byTypeMock(
        ['DOMAIN'],
        [
          {
            id: 'a_domain',
            value: 'example.com',
            type: 'DOMAIN',
            lastSeenAt: '2026-01-01T00:00:00.000Z',
          },
        ],
      ),
    ]);
    expect(await screen.findByText('example.com')).toBeInTheDocument();
  });

  it('queries with types=[SUBDOMAIN] and renders the subdomain rows', async () => {
    renderTab('SUBDOMAIN', [
      byTypeMock(
        ['SUBDOMAIN'],
        [
          {
            id: 'a_sub',
            value: 'api.example.com',
            type: 'SUBDOMAIN',
            lastSeenAt: '2026-01-02T00:00:00.000Z',
          },
        ],
      ),
    ]);
    expect(await screen.findByText('api.example.com')).toBeInTheDocument();
  });

  it('queries with types=[IP_ADDRESS] when kind=IP', async () => {
    renderTab('IP', [
      byTypeMock(
        ['IP_ADDRESS'],
        [
          {
            id: 'a_ip',
            value: '203.0.113.10',
            type: 'IP_ADDRESS',
            lastSeenAt: '2026-01-03T00:00:00.000Z',
          },
        ],
      ),
    ]);
    expect(await screen.findByText('203.0.113.10')).toBeInTheDocument();
  });

  it('flattens and dedups technologies across assets', async () => {
    renderTab('TECHNOLOGY', [technologiesMock]);
    await screen.findByText('nginx');
    expect(screen.getByText('React')).toBeInTheDocument();
    expect(screen.getByText('1.21.0')).toBeInTheDocument();
    // React@18.2.0 appears twice in the source data but dedups to one row.
    expect(screen.getAllByText('18.2.0')).toHaveLength(1);
  });

  it('shows empty state when the server-side filter returns no rows', async () => {
    renderTab('DOMAIN', [byTypeMock(['DOMAIN'], [])]);
    expect(await screen.findByText(/no domains yet/i)).toBeInTheDocument();
  });
});
