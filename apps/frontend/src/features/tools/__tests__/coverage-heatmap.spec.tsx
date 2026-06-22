import { describe, expect, it } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MockedProvider } from '@apollo/client/testing';
import { COVERAGE_MATRIX_QUERY, ASSET_COVERAGE_QUERY } from '../../../lib/graphql/queries';
import { CoverageHeatmap } from '../coverage-heatmap';

const ISO = '2025-06-01T12:00:00.000Z';

const matrixMock = {
  request: {
    query: COVERAGE_MATRIX_QUERY,
    variables: { engagementId: null },
  },
  result: {
    data: {
      coverageMatrix: [
        {
          __typename: 'CoverageCellObject',
          assetType: 'IP_ADDRESS',
          scannerName: 'nmap',
          observationCount: 2,
          assetCount: 2,
          lastObservedAt: ISO,
        },
        {
          __typename: 'CoverageCellObject',
          assetType: 'DOMAIN',
          scannerName: 'nmap',
          observationCount: 1,
          assetCount: 1,
          lastObservedAt: ISO,
        },
      ],
    },
  },
};

const drillDownMock = {
  request: {
    query: ASSET_COVERAGE_QUERY,
    variables: { engagementId: null, assetType: 'IP_ADDRESS' },
  },
  result: {
    data: {
      assetCoverage: [
        {
          __typename: 'AssetCoverageObject',
          assetId: 'asset-1',
          assetValue: '192.168.1.1',
          assetType: 'IP_ADDRESS',
          scannerName: 'nmap',
          observationCount: 2,
          lastObservedAt: ISO,
        },
      ],
    },
  },
};

describe('<CoverageHeatmap />', () => {
  it('renders column header and row headers after loading', async () => {
    render(
      <MockedProvider mocks={[matrixMock]}>
        <CoverageHeatmap />
      </MockedProvider>,
    );

    await waitFor(() => expect(screen.getByLabelText('coverage-heatmap')).toBeInTheDocument());

    expect(screen.getByText('nmap')).toBeInTheDocument();
    expect(screen.getByText('IP_ADDRESS')).toBeInTheDocument();
    expect(screen.getByText('DOMAIN')).toBeInTheDocument();
  });

  it('clicking a non-empty cell opens the drill-down and shows the asset value', async () => {
    render(
      <MockedProvider mocks={[matrixMock, drillDownMock]}>
        <CoverageHeatmap />
      </MockedProvider>,
    );

    await waitFor(() => expect(screen.getByLabelText('coverage-heatmap')).toBeInTheDocument());

    // Click the IP_ADDRESS × nmap cell
    const cell = screen.getByTitle(/IP_ADDRESS.*nmap|observations: 2/i);
    fireEvent.click(cell);

    await waitFor(() => expect(screen.getByLabelText('coverage-drilldown')).toBeInTheDocument());

    expect(screen.getByText('192.168.1.1')).toBeInTheDocument();

    // Close drill-down
    fireEvent.click(screen.getByText(/close drill-down/i));
    expect(screen.queryByLabelText('coverage-drilldown')).not.toBeInTheDocument();
  });
});
