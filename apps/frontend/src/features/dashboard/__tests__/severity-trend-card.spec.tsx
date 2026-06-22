import { describe, expect, it } from 'vitest';
import { MockedProvider } from '@apollo/client/testing';
import { render, screen, waitFor } from '@testing-library/react';
import { SEVERITY_TREND_QUERY } from '../../../lib/graphql/queries';
import { SeverityTrendCard } from '../severity-trend-card';

const trendMock = {
  request: {
    query: SEVERITY_TREND_QUERY,
    variables: { engagementId: null, range: { days: 30 } },
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

describe('<SeverityTrendCard />', () => {
  it('renders heading and chart container after data loads', async () => {
    render(
      <MockedProvider mocks={[trendMock]}>
        <SeverityTrendCard />
      </MockedProvider>,
    );

    await waitFor(() => expect(screen.getByLabelText('severity-trend-card')).toBeInTheDocument());
    expect(screen.getByText('Tendance de sévérité (30j)')).toBeInTheDocument();
    // chart renders an svg
    expect(document.querySelector('[aria-label="severity-trend-card"] svg')).toBeTruthy();
  });

  it('shows loading state initially', () => {
    render(
      <MockedProvider mocks={[trendMock]}>
        <SeverityTrendCard />
      </MockedProvider>,
    );
    expect(screen.getByText(/chargement/i)).toBeInTheDocument();
  });

  it('shows empty state when no trend data', async () => {
    const emptyMock = {
      request: {
        query: SEVERITY_TREND_QUERY,
        variables: { engagementId: null, range: { days: 30 } },
      },
      result: { data: { severityTrend: [] } },
    };
    render(
      <MockedProvider mocks={[emptyMock]}>
        <SeverityTrendCard />
      </MockedProvider>,
    );
    await waitFor(() => expect(screen.getByText(/aucune donnée/i)).toBeInTheDocument());
  });
});
