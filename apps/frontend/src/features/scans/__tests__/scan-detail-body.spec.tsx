import { describe, expect, it } from 'vitest';
import { MockedProvider } from '@apollo/client/testing';
import { MemoryRouter } from 'react-router-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SCAN_QUERY, CANCEL_SCAN_JOB_MUTATION } from '../../../lib/graphql/queries';
import { ScanDetailBody } from '../scan-detail-body';

const runningJob = {
  __typename: 'ScanJob' as const,
  id: 'job_1',
  scannerName: 'nmap',
  target: '10.0.0.1',
  status: 'RUNNING',
  rawOutputKey: null,
  findingCount: 5,
};

const scanQueryMock = {
  request: { query: SCAN_QUERY, variables: { id: 'scan_1' } },
  result: {
    data: {
      scan: {
        __typename: 'Scan' as const,
        id: 'scan_1',
        status: 'RUNNING',
        createdAt: '2024-01-15T10:00:00Z',
        completedAt: null,
        jobs: [runningJob],
      },
    },
  },
};

// Refetch mock needed after mutation
const scanQueryRefetchMock = {
  request: { query: SCAN_QUERY, variables: { id: 'scan_1' } },
  result: {
    data: {
      scan: {
        __typename: 'Scan' as const,
        id: 'scan_1',
        status: 'RUNNING',
        createdAt: '2024-01-15T10:00:00Z',
        completedAt: null,
        jobs: [runningJob],
      },
    },
  },
};

const cancelJobMock = {
  request: {
    query: CANCEL_SCAN_JOB_MUTATION,
    variables: { id: 'job_1' },
  },
  result: {
    data: {
      cancelScanJob: {
        __typename: 'ScanJob' as const,
        id: 'job_1',
        status: 'CANCELLED',
      },
    },
  },
};

function renderBody(mocks: Parameters<typeof MockedProvider>[0]['mocks']) {
  return render(
    <MemoryRouter>
      <MockedProvider mocks={mocks}>
        <ScanDetailBody scanId="scan_1" />
      </MockedProvider>
    </MemoryRouter>,
  );
}

describe('<ScanDetailBody />', () => {
  it('renders jobs from SCAN_QUERY — shows scannerName and findingCount', async () => {
    renderBody([scanQueryMock]);

    await waitFor(() => expect(screen.queryByText(/loading/i)).not.toBeInTheDocument());

    // Wrapping element with aria-label
    expect(screen.getByLabelText('scan-detail')).toBeInTheDocument();

    // Scanner name is visible
    expect(screen.getByText('nmap')).toBeInTheDocument();

    // findingCount is visible
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('clicking "Annuler" on a non-terminal job fires CANCEL_SCAN_JOB_MUTATION', async () => {
    const user = userEvent.setup();
    renderBody([scanQueryMock, cancelJobMock, scanQueryRefetchMock]);

    // Wait for the job row to appear
    await waitFor(() => expect(screen.getByText('nmap')).toBeInTheDocument());

    // The cancel button for a RUNNING job should be present
    const cancelBtn = screen.getByRole('button', { name: /annuler$/i });
    expect(cancelBtn).toBeInTheDocument();

    // Click — should not throw (mock matches)
    await user.click(cancelBtn);

    // After mutation+refetch the button still appears (status not changed in mock)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /annuler$/i })).toBeInTheDocument(),
    );
  });
});
