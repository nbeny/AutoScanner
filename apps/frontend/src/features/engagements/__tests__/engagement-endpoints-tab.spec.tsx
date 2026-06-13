import { describe, expect, it } from 'vitest';
import { MockedProvider } from '@apollo/client/testing';
import { render, screen } from '@testing-library/react';
import { ENDPOINTS_QUERY } from '../../../lib/graphql/queries';
import { EngagementEndpointsTab } from '../engagement-endpoints-tab';

const engagementId = 'eng_1';

const endpointsMock = {
  request: { query: ENDPOINTS_QUERY, variables: { engagementId } },
  result: {
    data: {
      endpoints: [
        {
          id: 'ep_1',
          url: 'https://example.com/api/users',
          method: 'GET',
          statusCode: 200,
          contentLength: 1024,
          source: 'katana',
          lastSeenAt: '2026-01-01T12:00:00.000Z',
        },
        {
          id: 'ep_2',
          url: 'https://example.com/api/login',
          method: 'POST',
          statusCode: 401,
          contentLength: null,
          source: 'katana',
          lastSeenAt: '2026-01-02T08:30:00.000Z',
        },
      ],
    },
  },
};

const emptyMock = {
  request: { query: ENDPOINTS_QUERY, variables: { engagementId } },
  result: { data: { endpoints: [] } },
};

function renderTab(mocks: Parameters<typeof MockedProvider>[0]['mocks']) {
  return render(
    <MockedProvider mocks={mocks}>
      <EngagementEndpointsTab engagementId={engagementId} />
    </MockedProvider>,
  );
}

describe('<EngagementEndpointsTab />', () => {
  it('renders endpoint URLs after data loads', async () => {
    renderTab([endpointsMock]);
    expect(await screen.findByText('https://example.com/api/users')).toBeInTheDocument();
    expect(screen.getByText('https://example.com/api/login')).toBeInTheDocument();
  });

  it('renders method and status for each endpoint', async () => {
    renderTab([endpointsMock]);
    await screen.findByText('https://example.com/api/users');
    expect(screen.getByText('GET')).toBeInTheDocument();
    expect(screen.getByText('POST')).toBeInTheDocument();
    expect(screen.getByText('200')).toBeInTheDocument();
    expect(screen.getByText('401')).toBeInTheDocument();
  });

  it('shows loading state initially', () => {
    renderTab([endpointsMock]);
    expect(screen.getByText(/loading endpoints/i)).toBeInTheDocument();
  });

  it('shows empty state when no endpoints are returned', async () => {
    renderTab([emptyMock]);
    expect(await screen.findByText(/no endpoints yet/i)).toBeInTheDocument();
  });
});
