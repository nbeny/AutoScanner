import { describe, expect, it, vi } from 'vitest';
import { MockedProvider } from '@apollo/client/testing';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { ALL_SCANS_QUERY } from '../../../lib/graphql/queries';
import { ActiveScannersList } from '../active-scanners-list';

const mocks = [
  {
    request: { query: ALL_SCANS_QUERY, variables: { filter: { statusIn: ['RUNNING', 'QUEUED'] } } },
    result: {
      data: {
        allScans: [
          {
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
          },
        ],
      },
    },
  },
];

describe('<ActiveScannersList />', () => {
  it('lists only running/queued jobs and fires onSelect', async () => {
    const onSelect = vi.fn();
    render(
      <MockedProvider mocks={mocks} addTypename={false}>
        <ActiveScannersList engagementId={undefined} selectedJobId={null} onSelect={onSelect} />
      </MockedProvider>,
    );
    await waitFor(() => expect(screen.getByText('nmap')).toBeInTheDocument());
    expect(screen.queryByText('httpx')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('nmap'));
    expect(onSelect).toHaveBeenCalledWith('scan-1', 'job-1');
  });
});
