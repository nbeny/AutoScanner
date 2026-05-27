import { describe, expect, it } from 'vitest';
import { MockedProvider } from '@apollo/client/testing';
import { render, screen, within } from '@testing-library/react';
import { ASSETS_QUERY } from '../../../lib/graphql/queries';
import { EngagementAssetsTab } from '../engagement-assets-tab';

const engagementId = 'eng_1';

const mixedAssetsMock = {
  request: { query: ASSETS_QUERY, variables: { engagementId } },
  result: {
    data: {
      assets: [
        {
          id: 'a_domain',
          value: 'example.com',
          type: 'DOMAIN',
          lastSeenAt: '2026-01-01T00:00:00.000Z',
          ports: [],
          technologies: [],
        },
        {
          id: 'a_subdomain',
          value: 'api.example.com',
          type: 'SUBDOMAIN',
          lastSeenAt: '2026-01-02T00:00:00.000Z',
          ports: [],
          technologies: [],
        },
        {
          id: 'a_ip',
          value: '203.0.113.10',
          type: 'IP_ADDRESS',
          lastSeenAt: '2026-01-03T00:00:00.000Z',
          ports: [],
          technologies: [],
        },
        {
          id: 'a_tech_host',
          value: 'https://api.example.com',
          type: 'URL',
          lastSeenAt: '2026-01-04T00:00:00.000Z',
          ports: [],
          technologies: [
            { id: 't_1', name: 'nginx', version: '1.21.0' },
            { id: 't_2', name: 'React', version: '18.2.0' },
          ],
        },
      ],
    },
  },
};

const emptyAssetsMock = {
  request: { query: ASSETS_QUERY, variables: { engagementId } },
  result: { data: { assets: [] } },
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
  it('renders only DOMAIN-typed assets when kind=DOMAIN', async () => {
    renderTab('DOMAIN', [mixedAssetsMock]);
    const cell = await screen.findByText('example.com');
    expect(cell).toBeInTheDocument();
    expect(screen.queryByText('api.example.com')).not.toBeInTheDocument();
    expect(screen.queryByText('203.0.113.10')).not.toBeInTheDocument();
  });

  it('renders only SUBDOMAIN-typed assets when kind=SUBDOMAIN', async () => {
    renderTab('SUBDOMAIN', [mixedAssetsMock]);
    const cell = await screen.findByText('api.example.com');
    expect(cell).toBeInTheDocument();
    expect(screen.queryByText('example.com')).not.toBeInTheDocument();
    expect(screen.queryByText('203.0.113.10')).not.toBeInTheDocument();
  });

  it('renders only IP_ADDRESS assets when kind=IP', async () => {
    renderTab('IP', [mixedAssetsMock]);
    const cell = await screen.findByText('203.0.113.10');
    expect(cell).toBeInTheDocument();
    expect(screen.queryByText('example.com')).not.toBeInTheDocument();
    expect(screen.queryByText('api.example.com')).not.toBeInTheDocument();
  });

  it('renders flattened technologies when kind=TECHNOLOGY', async () => {
    renderTab('TECHNOLOGY', [mixedAssetsMock]);
    await screen.findByText('nginx');
    expect(screen.getByText('React')).toBeInTheDocument();
    // version columns also rendered
    expect(screen.getByText('1.21.0')).toBeInTheDocument();
    expect(screen.getByText('18.2.0')).toBeInTheDocument();
  });

  it('shows empty state when no matching assets', async () => {
    renderTab('DOMAIN', [emptyAssetsMock]);
    expect(await screen.findByText(/no .* yet/i)).toBeInTheDocument();
  });
});
