import { describe, expect, it } from 'vitest';
import { MockedProvider } from '@apollo/client/testing';
import { render, screen, waitFor } from '@testing-library/react';
import { SEVERITY_TREND_QUERY, COVERAGE_SUMMARY_QUERY } from '../../../../lib/graphql/queries';
import { EngagementTrendPanel } from '../engagement-trend-panel';

const engagementId = 'e1';

const trendMock = {
  request: {
    query: SEVERITY_TREND_QUERY,
    variables: { engagementId, range: { days: 30 } },
  },
  result: {
    data: {
      severityTrend: [
        {
          __typename: 'SeverityTrendBucketObject',
          bucketDate: '2026-06-01',
          counts: {
            __typename: 'SeverityCountsObject',
            critical: 3,
            high: 5,
            medium: 2,
            low: 1,
            info: 0,
          },
        },
      ],
    },
  },
};

const coverageMock = {
  request: {
    query: COVERAGE_SUMMARY_QUERY,
    variables: { engagementId },
  },
  result: {
    data: {
      coverageSummary: {
        __typename: 'CoverageSummaryObject',
        totalAssets: 100,
        scannedAssets: 50,
        percent: 50,
      },
    },
  },
};

describe('<EngagementTrendPanel />', () => {
  it('renders the panel and shows coverage percent after load', async () => {
    render(
      <MockedProvider mocks={[trendMock, coverageMock]}>
        <EngagementTrendPanel engagementId={engagementId} />
      </MockedProvider>,
    );

    // Panel root present
    await waitFor(() =>
      expect(screen.getByLabelText('engagement-trend-panel')).toBeInTheDocument(),
    );

    // Coverage percent visible
    await waitFor(() => expect(screen.getByText('50%')).toBeInTheDocument());
  });

  it('renders an svg for the trend chart after load', async () => {
    render(
      <MockedProvider mocks={[trendMock, coverageMock]}>
        <EngagementTrendPanel engagementId={engagementId} />
      </MockedProvider>,
    );

    // SVG rendered by recharts TrendChart
    await waitFor(() => {
      const svg = document.querySelector('svg');
      expect(svg).toBeInTheDocument();
    });
  });
});
