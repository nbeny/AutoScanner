import { describe, expect, it, vi } from 'vitest';
import { MockedProvider } from '@apollo/client/testing';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ALL_SCANS_QUERY } from '../../../lib/graphql/queries';
import { ScansList } from '../scans-list';

// Terminal statuses for computing progress
// COMPLETED, FAILED, CANCELLED, TIMEOUT

const baseScan = {
  __typename: 'Scan' as const,
  id: 'scan-1',
  engagementId: 'eng-1',
  name: 'Test Scan',
  status: 'RUNNING',
  createdAt: '2024-01-15T10:00:00Z',
  completedAt: null,
  jobs: [
    {
      __typename: 'ScanJob' as const,
      id: 'job-1',
      scannerName: 'nmap',
      target: '192.168.1.1',
      status: 'COMPLETED',
      durationMs: 5000,
      exitCode: 0,
      errorMessage: null,
      startedAt: '2024-01-15T10:00:00Z',
      completedAt: '2024-01-15T10:00:05Z',
      findingCount: 3,
    },
    {
      __typename: 'ScanJob' as const,
      id: 'job-2',
      scannerName: 'nuclei',
      target: '192.168.1.1',
      status: 'RUNNING',
      durationMs: null,
      exitCode: null,
      errorMessage: null,
      startedAt: '2024-01-15T10:00:05Z',
      completedAt: null,
      findingCount: 0,
    },
  ],
};

function makeMock(scans: (typeof baseScan)[] = [baseScan], variables = { filter: {} }) {
  return {
    request: {
      query: ALL_SCANS_QUERY,
      variables,
    },
    result: {
      data: {
        allScans: scans,
      },
    },
  };
}

describe('<ScansList />', () => {
  it('renders a scan row and status bar from ALL_SCANS_QUERY', async () => {
    render(
      <MockedProvider mocks={[makeMock()]}>
        <ScansList />
      </MockedProvider>,
    );

    // Wait for loading to complete
    await waitFor(() => expect(screen.queryByText(/loading/i)).not.toBeInTheDocument());

    // Target from first job
    expect(screen.getByText('192.168.1.1')).toBeInTheDocument();

    // Progress: 1 completed out of 2 total
    expect(screen.getByText('1/2')).toBeInTheDocument();

    // Status bar should show running count
    const statusBar = screen.getByLabelText('scans-status-bar');
    expect(statusBar).toBeInTheDocument();
    expect(statusBar).toHaveTextContent('1');
  });

  it('calls onSelect with the scan id when a row is clicked', async () => {
    const onSelect = vi.fn();
    render(
      <MockedProvider mocks={[makeMock()]}>
        <ScansList onSelect={onSelect} />
      </MockedProvider>,
    );

    await waitFor(() => expect(screen.queryByText(/loading/i)).not.toBeInTheDocument());

    const row = screen.getByRole('row', { name: /scan-1/ });
    await userEvent.click(row);

    expect(onSelect).toHaveBeenCalledWith('scan-1');
  });

  it('renders the empty state when allScans is []', async () => {
    render(
      <MockedProvider mocks={[makeMock([])]}>
        <ScansList />
      </MockedProvider>,
    );

    await waitFor(() => expect(screen.queryByText(/loading/i)).not.toBeInTheDocument());

    expect(screen.getByText(/no scans/i)).toBeInTheDocument();
  });
});
