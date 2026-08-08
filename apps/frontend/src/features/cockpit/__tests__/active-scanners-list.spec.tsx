import { describe, expect, it, vi } from 'vitest';
import { MockedProvider } from '@apollo/client/testing';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { ALL_SCANS_QUERY } from '../../../lib/graphql/queries';
import { ActiveScannersList } from '../active-scanners-list';

const scan = {
  id: 'scan-1',
  engagementId: 'eng-1',
  name: 'nmap run',
  status: 'RUNNING',
  createdAt: '2026-01-01',
  completedAt: null,
  jobs: [
    {
      id: 'job-1',
      scannerName: 'nmap',
      target: '10.0.0.1',
      status: 'RUNNING',
      durationMs: null,
      exitCode: null,
      errorMessage: null,
      startedAt: '2026-01-01',
      completedAt: null,
      findingCount: 0,
    },
    {
      id: 'job-2',
      scannerName: 'httpx',
      target: '10.0.0.1',
      status: 'COMPLETED',
      durationMs: 1000,
      exitCode: 0,
      errorMessage: null,
      startedAt: '2026-01-01',
      completedAt: '2026-01-01',
      findingCount: 3,
    },
  ],
};

// Default filter is "Tous" → no statusIn; the panel shows every job.
const allMock = {
  request: { query: ALL_SCANS_QUERY, variables: { filter: {} } },
  result: { data: { allScans: [scan] } },
};

// "En cours" → statusIn RUNNING; server returns the running scan, panel keeps
// only the RUNNING job.
const runningMock = {
  request: { query: ALL_SCANS_QUERY, variables: { filter: { statusIn: ['RUNNING'] } } },
  result: { data: { allScans: [scan] } },
};

describe('<ActiveScannersList />', () => {
  it('defaults to "Tous" and shows every job, firing onSelect with the job', async () => {
    const onSelect = vi.fn();
    render(
      <MockedProvider mocks={[allMock]} addTypename={false}>
        <ActiveScannersList engagementId={undefined} selectedJobId={null} onSelect={onSelect} />
      </MockedProvider>,
    );
    await waitFor(() => expect(screen.getByText('nmap')).toBeInTheDocument());
    // "Tous" keeps the completed sibling too.
    expect(screen.getByText('httpx')).toBeInTheDocument();
    fireEvent.click(screen.getByText('nmap'));
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ scanId: 'scan-1', jobId: 'job-1', scannerName: 'nmap' }),
    );
  });

  it('filters to running-only when "En cours" is selected', async () => {
    render(
      <MockedProvider mocks={[allMock, runningMock]} addTypename={false}>
        <ActiveScannersList engagementId={undefined} selectedJobId={null} onSelect={vi.fn()} />
      </MockedProvider>,
    );
    await waitFor(() => expect(screen.getByText('httpx')).toBeInTheDocument());
    fireEvent.click(screen.getByText('En cours'));
    await waitFor(() => expect(screen.queryByText('httpx')).not.toBeInTheDocument());
    expect(screen.getByText('nmap')).toBeInTheDocument();
  });
});
