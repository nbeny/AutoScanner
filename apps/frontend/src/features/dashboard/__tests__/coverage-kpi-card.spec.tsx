import { describe, expect, it } from 'vitest';
import { MockedProvider } from '@apollo/client/testing';
import { render, screen, waitFor } from '@testing-library/react';
import { COVERAGE_SUMMARY_QUERY } from '../../../lib/graphql/queries';
import { CoverageKpiCard } from '../coverage-kpi-card';

function makeCoverageMock(totalAssets: number, scannedAssets: number, percent: number) {
  return {
    request: {
      query: COVERAGE_SUMMARY_QUERY,
      variables: { engagementId: null },
    },
    result: {
      data: {
        coverageSummary: {
          __typename: 'CoverageSummaryObject',
          totalAssets,
          scannedAssets,
          percent,
        },
      },
    },
  };
}

describe('<CoverageKpiCard />', () => {
  it('renders heading, asset counts and percent after data loads', async () => {
    render(
      <MockedProvider mocks={[makeCoverageMock(100, 75, 75)]}>
        <CoverageKpiCard />
      </MockedProvider>,
    );

    await waitFor(() => expect(screen.getByLabelText('coverage-kpi-card')).toBeInTheDocument());
    expect(screen.getByText('Couverture')).toBeInTheDocument();
    expect(screen.getByText('75')).toBeInTheDocument(); // scannedAssets
    expect(screen.getByText('100')).toBeInTheDocument(); // totalAssets
    expect(screen.getByText('75%')).toBeInTheDocument(); // percent text
  });

  it('shows loading state initially', () => {
    render(
      <MockedProvider mocks={[makeCoverageMock(0, 0, 0)]}>
        <CoverageKpiCard />
      </MockedProvider>,
    );
    expect(screen.getByText(/chargement/i)).toBeInTheDocument();
  });

  it('renders progress bar with correct width', async () => {
    render(
      <MockedProvider mocks={[makeCoverageMock(200, 100, 50)]}>
        <CoverageKpiCard />
      </MockedProvider>,
    );

    await waitFor(() => expect(screen.getByLabelText('coverage-kpi-card')).toBeInTheDocument());
    // progress bar has role="progressbar" with aria-valuenow=50
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '50');
  });
});
