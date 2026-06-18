import { describe, expect, it } from 'vitest';
import { MockedProvider } from '@apollo/client/testing';
import { MemoryRouter } from 'react-router-dom';
import { render, screen, waitFor } from '@testing-library/react';
import {
  ENGAGEMENT_SUMMARIES_QUERY,
  GLOBAL_OVERVIEW_QUERY,
  RECENT_ACTIVITY_QUERY,
} from '../../../lib/graphql/queries';
import { DashboardPage } from '../dashboard-page';

const overviewMock = {
  request: { query: GLOBAL_OVERVIEW_QUERY },
  result: {
    data: {
      globalOverview: {
        __typename: 'GlobalOverviewObject',
        engagementsByStatus: {
          __typename: 'EngagementsByStatusObject',
          draft: 0,
          active: 1,
          paused: 0,
          completed: 0,
          archived: 0,
          total: 1,
        },
        domains: 0,
        subdomains: 0,
        ipAddresses: 0,
        openPorts: 0,
        uniqueTechs: 0,
        findingsBySeverity: {
          __typename: 'SeverityCountsObject',
          critical: 0,
          high: 0,
          medium: 0,
          low: 0,
          info: 0,
        },
        activeSchedules: 0,
        runningScans: 0,
      },
    },
  },
};

const activityMock = {
  request: { query: RECENT_ACTIVITY_QUERY, variables: { limit: 15 } },
  result: { data: { recentActivity: [] } },
};

const summariesMock = {
  request: { query: ENGAGEMENT_SUMMARIES_QUERY },
  result: { data: { engagementSummaries: [] } },
};

describe('<DashboardPage />', () => {
  it('composes overview, activity feed and engagement grid under a Dashboard header', async () => {
    render(
      <MockedProvider mocks={[overviewMock, activityMock, summariesMock]}>
        <MemoryRouter>
          <DashboardPage />
        </MemoryRouter>
      </MockedProvider>,
    );

    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument();

    await waitFor(() => expect(screen.getByLabelText('dashboard-kpis')).toBeInTheDocument());
    expect(screen.getByLabelText('recent-activity')).toBeInTheDocument();
    expect(screen.getByLabelText('engagement-summary-grid')).toBeInTheDocument();
  });
});
