import { describe, expect, it } from 'vitest';
import { MockedProvider } from '@apollo/client/testing';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AuthProvider } from '../../../lib/auth-context';
import type { AuthSession, AuthStorage } from '../../../lib/auth';
import { AI_RUN_EVENTS_SUBSCRIPTION, AI_RUN_QUERY } from '../../../lib/graphql/queries';
import { HuntRunPage } from '../hunt-run-page';

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

const now = new Date().toISOString();

const aiRunMock = {
  request: { query: AI_RUN_QUERY, variables: { id: 'air_1' } },
  result: {
    data: {
      aiRun: {
        id: 'air_1',
        target: '10.0.0.5',
        strategy: 'SINGLE_HOST',
        status: 'COMPLETED',
        scanCount: 3,
        currentDepth: 2,
        degraded: false,
        auditText: 'Final audit narrative: two findings observed.',
        errorMessage: null,
        createdAt: now,
        startedAt: now,
        completedAt: now,
        nodes: [
          {
            id: 'n1',
            parentNodeId: null,
            scanId: 's1',
            scannerName: 'nmap',
            target: '10.0.0.5',
            depth: 0,
            rationale: 'Discover open ports',
            status: 'COMPLETED',
            createdAt: now,
          },
          {
            id: 'n2',
            parentNodeId: 'n1',
            scanId: 's2',
            scannerName: 'httpx',
            target: '10.0.0.5:80',
            depth: 1,
            rationale: 'Probe web services',
            status: 'COMPLETED',
            createdAt: now,
          },
          {
            id: 'n3',
            parentNodeId: 'n2',
            scanId: 's3',
            scannerName: 'nuclei',
            target: 'http://10.0.0.5',
            depth: 2,
            rationale: 'Template-based vuln scan',
            status: 'COMPLETED',
            createdAt: now,
          },
        ],
        decisions: [{ id: 'd1', round: 1, degraded: false, createdAt: now }],
      },
    },
  },
};

const eventsSubMock = {
  request: { query: AI_RUN_EVENTS_SUBSCRIPTION, variables: { id: 'air_1' } },
  result: { data: { aiRunEvents: null } },
};

function renderPage(mocks: Parameters<typeof MockedProvider>[0]['mocks']) {
  return render(
    <MemoryRouter initialEntries={['/hunt/air_1']}>
      <AuthProvider storage={makeMemoryStorage(session)}>
        <MockedProvider mocks={mocks}>
          <Routes>
            <Route path="/hunt/:aiRunId" element={<HuntRunPage />} />
          </Routes>
        </MockedProvider>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('<HuntRunPage />', () => {
  it('renders the target and status', async () => {
    renderPage([aiRunMock, eventsSubMock]);
    expect(await screen.findByText('10.0.0.5')).toBeInTheDocument();
    expect(screen.getByText('COMPLETED')).toBeInTheDocument();
  });

  it('renders a node label per scanner in the graph', async () => {
    renderPage([aiRunMock, eventsSubMock]);
    expect(await screen.findByText('nmap')).toBeInTheDocument();
    expect(screen.getByText('httpx')).toBeInTheDocument();
    expect(screen.getByText('nuclei')).toBeInTheDocument();
  });

  it('shows the node details when a graph node is clicked', async () => {
    renderPage([aiRunMock, eventsSubMock]);
    const httpx = await screen.findByText('httpx');
    fireEvent.click(httpx.closest('g')!);
    await waitFor(() => {
      expect(screen.getByText('Probe web services')).toBeInTheDocument();
    });
    expect(screen.getByText('10.0.0.5:80')).toBeInTheDocument();
  });

  it('renders the audit text', async () => {
    renderPage([aiRunMock, eventsSubMock]);
    expect(
      await screen.findByText(/final audit narrative: two findings observed/i),
    ).toBeInTheDocument();
  });
});
