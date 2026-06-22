import { describe, expect, it } from 'vitest';
import { MockedProvider } from '@apollo/client/testing';
import { MemoryRouter } from 'react-router-dom';
import { render, screen, waitFor } from '@testing-library/react';
import {
  GLOBAL_OVERVIEW_QUERY,
  SEVERITY_TREND_QUERY,
  COVERAGE_SUMMARY_QUERY,
  TOOL_ACTIVITY_QUERY,
} from '../../../lib/graphql/queries';
import { DashboardOverview } from '../dashboard-overview';

function mockOverview(overview: Record<string, unknown>) {
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

const trendMock = {
  request: {
    query: SEVERITY_TREND_QUERY,
    variables: { engagementId: null, range: { days: 30 } },
  },
  result: {
    data: {
      severityTrend: [],
    },
  },
};

const coverageMock = {
  request: {
    query: COVERAGE_SUMMARY_QUERY,
    variables: { engagementId: null },
  },
  result: {
    data: {
      coverageSummary: {
        __typename: 'CoverageSummaryObject',
        totalAssets: 0,
        scannedAssets: 0,
        percent: 0,
      },
    },
  },
};

const toolActivityMock = {
  request: {
    query: TOOL_ACTIVITY_QUERY,
    variables: { engagementId: null },
  },
  result: {
    data: {
      toolActivity: [],
    },
  },
};

// TOOL_ACTIVITY_QUERY is used by two cards; Apollo dedupes in-flight requests
// but MockedProvider needs one mock per response expected.
const toolActivityMock2 = {
  request: {
    query: TOOL_ACTIVITY_QUERY,
    variables: { engagementId: null },
  },
  result: {
    data: {
      toolActivity: [],
    },
  },
};

describe('<DashboardOverview />', () => {
  it('renders KPI tiles, attack surface and severity donut from globalOverview', async () => {
    const mocks = [
      mockOverview({
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
      trendMock,
      coverageMock,
      toolActivityMock,
      toolActivityMock2,
    ];

    render(
      <MockedProvider mocks={mocks}>
        <MemoryRouter>
          <DashboardOverview />
        </MemoryRouter>
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
      <MockedProvider
        mocks={[mockOverview({}), trendMock, coverageMock, toolActivityMock, toolActivityMock2]}
      >
        <MemoryRouter>
          <DashboardOverview />
        </MemoryRouter>
      </MockedProvider>,
    );
    await waitFor(() => expect(screen.getByText(/No findings yet/i)).toBeInTheDocument());
  });
});
