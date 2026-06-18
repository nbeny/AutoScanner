import { describe, expect, it } from 'vitest';
import { MockedProvider } from '@apollo/client/testing';
import { render, screen, waitFor } from '@testing-library/react';
import { GLOBAL_OVERVIEW_QUERY } from '../../../lib/graphql/queries';
import { DashboardOverview } from '../dashboard-overview';

function mock(overview: Record<string, unknown>) {
  return {
    request: { query: GLOBAL_OVERVIEW_QUERY },
    result: {
      data: {
        globalOverview: {
          __typename: 'GlobalOverviewObject',
          engagementsByStatus: {
            __typename: 'EngagementsByStatusObject',
            draft: 0,
            active: 0,
            paused: 0,
            completed: 0,
            archived: 0,
            total: 0,
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
          ...overview,
        },
      },
    },
  };
}

describe('<DashboardOverview />', () => {
  it('renders KPI tiles, attack surface and severity donut from globalOverview', async () => {
    const mocks = [
      mock({
        engagementsByStatus: {
          __typename: 'EngagementsByStatusObject',
          draft: 1,
          active: 3,
          paused: 0,
          completed: 0,
          archived: 0,
          total: 4,
        },
        domains: 7,
        runningScans: 2,
        activeSchedules: 5,
        findingsBySeverity: {
          __typename: 'SeverityCountsObject',
          critical: 2,
          high: 4,
          medium: 1,
          low: 0,
          info: 0,
        },
      }),
    ];

    render(
      <MockedProvider mocks={mocks}>
        <DashboardOverview />
      </MockedProvider>,
    );

    await waitFor(() => expect(screen.getByLabelText('dashboard-kpis')).toBeInTheDocument());
    // 4 engagements, 7 findings total (2+4+1), donut center total = 7, surface domains = 7
    expect(screen.getByLabelText('global-attack-surface')).toHaveTextContent('7');
    expect(screen.getByLabelText('total-findings')).toHaveTextContent('7');
    expect(screen.getByLabelText('arc-critical-2')).toBeInTheDocument();
  });

  it('renders the empty severity state when there are no findings', async () => {
    render(
      <MockedProvider mocks={[mock({})]}>
        <DashboardOverview />
      </MockedProvider>,
    );
    await waitFor(() => expect(screen.getByText(/No findings yet/i)).toBeInTheDocument());
  });
});
