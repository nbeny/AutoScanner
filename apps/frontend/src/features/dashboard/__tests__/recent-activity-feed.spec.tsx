import { describe, expect, it } from 'vitest';
import { MockedProvider } from '@apollo/client/testing';
import { MemoryRouter } from 'react-router-dom';
import { render, screen, waitFor } from '@testing-library/react';
import { RECENT_ACTIVITY_QUERY } from '../../../lib/graphql/queries';
import { RecentActivityFeed } from '../recent-activity-feed';

function mock(items: unknown[]) {
  return {
    request: { query: RECENT_ACTIVITY_QUERY, variables: { limit: 15 } },
    result: { data: { recentActivity: items } },
  };
}

function item(over: Record<string, unknown>) {
  return {
    __typename: 'ActivityItemObject',
    id: 'x',
    kind: 'SCAN',
    engagementId: 'e1',
    engagementName: 'Acme',
    label: 'nmap',
    status: 'COMPLETED',
    ts: '2026-06-18T11:00:00.000Z',
    ...over,
  };
}

function renderFeed(mocks: ReturnType<typeof mock>[]) {
  return render(
    <MockedProvider mocks={mocks}>
      <MemoryRouter>
        <RecentActivityFeed />
      </MemoryRouter>
    </MockedProvider>,
  );
}

describe('<RecentActivityFeed />', () => {
  it('renders activity items with label, engagement link and status', async () => {
    renderFeed([
      mock([
        item({ id: 's1', kind: 'SCAN', label: 'nmap', engagementName: 'Acme' }),
        item({
          id: 'tr1',
          kind: 'TEMPLATE_RUN',
          label: 'full-recon',
          engagementName: 'Globex',
          engagementId: 'e2',
          status: 'RUNNING',
        }),
      ]),
    ]);

    await waitFor(() => expect(screen.getByLabelText('recent-activity')).toBeInTheDocument());
    expect(screen.getByText('nmap')).toBeInTheDocument();
    expect(screen.getByText('full-recon')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Globex' })).toHaveAttribute('href', '/engagements/e2');
  });

  it('shows an empty state when there is no activity', async () => {
    renderFeed([mock([])]);
    await waitFor(() => expect(screen.getByText(/No activity yet/i)).toBeInTheDocument());
  });
});
