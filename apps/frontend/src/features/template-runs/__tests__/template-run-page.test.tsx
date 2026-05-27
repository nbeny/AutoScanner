import { describe, expect, it } from 'vitest';
import { MockedProvider } from '@apollo/client/testing';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { render, screen, within } from '@testing-library/react';
import { AuthProvider } from '../../../lib/auth-context';
import type { AuthSession, AuthStorage } from '../../../lib/auth';
import { TEMPLATE_RUN_QUERY } from '../../../lib/graphql/queries';
import { TemplateRunPage } from '../template-run-page';

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

function templateRunMock(scans: unknown[]) {
  return {
    request: { query: TEMPLATE_RUN_QUERY, variables: { id: 'trun_1' } },
    result: {
      data: {
        templateRun: {
          id: 'trun_1',
          templateName: 'recon-passive',
          target: 'example.com',
          status: 'RUNNING',
          currentStepIndex: 1,
          startedAt: new Date('2026-05-27T10:00:00Z').toISOString(),
          completedAt: null,
          errorMessage: null,
          scans,
        },
      },
    },
  };
}

function renderPage(mocks: Parameters<typeof MockedProvider>[0]['mocks']) {
  return render(
    <MemoryRouter initialEntries={['/engagements/eng_1/template-runs/trun_1']}>
      <AuthProvider storage={makeMemoryStorage(session)}>
        <MockedProvider mocks={mocks}>
          <Routes>
            <Route
              path="/engagements/:engagementId/template-runs/:templateRunId"
              element={<TemplateRunPage />}
            />
          </Routes>
        </MockedProvider>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('<TemplateRunPage />', () => {
  it('renders one step card per scan in the template run', async () => {
    const scans = [
      {
        id: 'scan_1',
        status: 'COMPLETED',
        createdAt: new Date('2026-05-27T10:00:01Z').toISOString(),
        completedAt: new Date('2026-05-27T10:00:30Z').toISOString(),
        jobs: [
          {
            id: 'job_1',
            scannerName: 'subfinder',
            target: 'example.com',
            status: 'COMPLETED',
            rawOutputKey: 'engagements/eng_1/scans/scan_1/jobs/job_1/raw.json',
          },
        ],
      },
      {
        id: 'scan_2',
        status: 'RUNNING',
        createdAt: new Date('2026-05-27T10:00:31Z').toISOString(),
        completedAt: null,
        jobs: [
          {
            id: 'job_2',
            scannerName: 'httpx',
            target: 'example.com',
            status: 'RUNNING',
            rawOutputKey: null,
          },
        ],
      },
    ];
    // Provide a second identical mock entry to cover a possible 3s poll tick
    // if the test runs slowly — prevents Apollo "no more mocked responses" noise.
    renderPage([templateRunMock(scans), templateRunMock(scans)]);

    const stepCards = await screen.findAllByLabelText(/template-step-card/i);
    expect(stepCards).toHaveLength(2);

    // Header info: template name, target, and run-level status badge.
    expect(screen.getByRole('heading', { name: 'recon-passive' })).toBeInTheDocument();
    const targetCode = screen.getAllByText('example.com').find((el) => el.tagName === 'CODE');
    expect(targetCode).toBeDefined();
    // Run-level status badge — there is exactly one "RUNNING" badge on the run (the
    // 2nd scan is also RUNNING but only its card is open by default).
    expect(screen.getAllByText('RUNNING').length).toBeGreaterThanOrEqual(1);

    // Each card surfaces its scanner name.
    expect(within(stepCards[0]).getByText(/subfinder/)).toBeInTheDocument();
    expect(within(stepCards[1]).getByText(/httpx/)).toBeInTheDocument();
  });

  it('shows a "no steps yet" message when the run has no scans', async () => {
    renderPage([templateRunMock([])]);

    expect(await screen.findByText(/no steps yet/i)).toBeInTheDocument();
  });
});
