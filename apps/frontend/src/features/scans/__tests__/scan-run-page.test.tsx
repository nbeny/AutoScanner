import { describe, expect, it } from 'vitest';
import { MockedProvider } from '@apollo/client/testing';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { AuthProvider } from '../../../lib/auth-context';
import type { AuthSession, AuthStorage } from '../../../lib/auth';
import {
  ASSETS_QUERY,
  RUN_SCAN_MUTATION,
  SCAN_QUERY,
  SCAN_TEMPLATES_QUERY,
} from '../../../lib/graphql/queries';
import { ScanRunPage } from '../scan-run-page';

function makeMemoryStorage(initial: AuthSession): AuthStorage {
  let value: AuthSession | null = initial;
  return {
    read: () => value,
    write: (s) => {
      value = s;
    },
    clear: () => {
      value = null;
    },
  };
}

const session: AuthSession = {
  apiUrl: 'http://api.example',
  accessToken: 'a',
  refreshToken: 'r',
  email: 'op@example.com',
};

const emptyAssetsMock = {
  request: { query: ASSETS_QUERY, variables: { engagementId: 'eng_1' } },
  result: { data: { assets: [] } },
};

const scanTemplatesMock = {
  request: { query: SCAN_TEMPLATES_QUERY },
  result: {
    data: {
      scanTemplates: [
        {
          id: 'tmpl_1',
          name: 'recon-passive',
          displayName: 'Recon Passive',
          description: null,
        },
      ],
    },
  },
};

function renderPage(mocks: Parameters<typeof MockedProvider>[0]['mocks']) {
  return render(
    <MemoryRouter initialEntries={['/engagements/eng_1/scans']}>
      <AuthProvider storage={makeMemoryStorage(session)}>
        <MockedProvider mocks={mocks}>
          <Routes>
            <Route path="/engagements/:engagementId/scans" element={<ScanRunPage />} />
          </Routes>
        </MockedProvider>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('<ScanRunPage />', () => {
  it('rejects invalid options JSON locally and does not call the mutation', async () => {
    renderPage([emptyAssetsMock, scanTemplatesMock]);
    await screen.findByText(/no assets yet/i);

    fireEvent.change(screen.getByLabelText(/options json/i), { target: { value: '{broken' } });
    fireEvent.submit(screen.getByRole('form', { name: 'run-scan' }));

    const alerts = await screen.findAllByRole('alert');
    expect(alerts.some((el) => el.textContent === 'Options must be valid JSON.')).toBe(true);
    expect(screen.queryByLabelText('scan-status')).not.toBeInTheDocument();
  });

  it('submits runScan and reveals scan status section with the returned scan id', async () => {
    const runMock = {
      request: {
        query: RUN_SCAN_MUTATION,
        variables: {
          input: {
            engagementId: 'eng_1',
            scannerName: 'nmap',
            target: '10.0.0.1',
            optionsJson: undefined,
          },
        },
      },
      result: {
        data: {
          runScan: {
            id: 'scan_1',
            status: 'QUEUED',
            jobs: [{ id: 'job_1', scannerName: 'nmap', target: '10.0.0.1', status: 'QUEUED' }],
          },
        },
      },
    };
    const scanPollMock = {
      request: { query: SCAN_QUERY, variables: { id: 'scan_1' } },
      result: {
        data: {
          scan: {
            id: 'scan_1',
            status: 'RUNNING',
            completedAt: null,
            jobs: [
              {
                id: 'job_1',
                scannerName: 'nmap',
                target: '10.0.0.1',
                status: 'RUNNING',
                rawOutputKey: null,
              },
            ],
          },
        },
      },
    };

    renderPage([emptyAssetsMock, scanTemplatesMock, runMock, scanPollMock]);
    await screen.findByText(/no assets yet/i);

    // Both forms have a "Target" input — pick the one inside the run-scan form.
    const runScanForm = screen.getByRole('form', { name: 'run-scan' });
    const targetInput = within(runScanForm).getByLabelText('Target');
    fireEvent.change(targetInput, { target: { value: '10.0.0.1' } });
    fireEvent.submit(runScanForm);

    await waitFor(() => expect(screen.getByLabelText('scan-status')).toBeInTheDocument());
    expect(screen.getByText(/Scan scan_1/)).toBeInTheDocument();
  });
});
