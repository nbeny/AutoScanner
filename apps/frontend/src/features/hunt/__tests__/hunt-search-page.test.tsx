import { describe, expect, it } from 'vitest';
import { MockedProvider } from '@apollo/client/testing';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AuthProvider } from '../../../lib/auth-context';
import type { AuthSession, AuthStorage } from '../../../lib/auth';
import { RUN_AI_SCAN } from '../../../lib/graphql/queries';
import { DEFAULT_GUARDRAILS } from '../types';
import { HuntSearchPage } from '../hunt-search-page';

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

function renderPage(mocks: Parameters<typeof MockedProvider>[0]['mocks']) {
  return render(
    <MemoryRouter initialEntries={['/hunt']}>
      <AuthProvider storage={makeMemoryStorage(session)}>
        <MockedProvider mocks={mocks}>
          <Routes>
            <Route path="/hunt" element={<HuntSearchPage />} />
            <Route path="/hunt/:id" element={<div>RUN PAGE</div>} />
          </Routes>
        </MockedProvider>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('<HuntSearchPage />', () => {
  it('renders the wordmark and search input', () => {
    renderPage([]);
    expect(screen.getByText(/AutoHunt|Auto/)).toBeInTheDocument();
    expect(screen.getByLabelText('target')).toBeInTheDocument();
  });

  it('shows an invalid hint and disables submit for a non-target', () => {
    renderPage([]);
    fireEvent.change(screen.getByLabelText('target'), { target: { value: 'nope' } });
    expect(screen.getByText(/not a valid ip/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /hunt/i })).toBeDisabled();
  });

  it('enables submit for a valid IP and navigates on success', async () => {
    const runMock = {
      request: {
        query: RUN_AI_SCAN,
        variables: { input: { target: '1.2.3.4', guardrails: DEFAULT_GUARDRAILS } },
      },
      result: {
        data: {
          runAiScan: {
            id: 'air_1',
            status: 'QUEUED',
            target: '1.2.3.4',
            strategy: 'SINGLE_HOST',
          },
        },
      },
    };

    renderPage([runMock]);
    fireEvent.change(screen.getByLabelText('target'), { target: { value: '1.2.3.4' } });
    const submit = screen.getByRole('button', { name: /hunt/i });
    expect(submit).not.toBeDisabled();
    fireEvent.click(submit);

    expect(await screen.findByText('RUN PAGE')).toBeInTheDocument();
  });

  it('sends edited Max scans guardrail in the mutation variables', async () => {
    const runMock = {
      request: {
        query: RUN_AI_SCAN,
        variables: {
          input: {
            target: '1.2.3.4',
            guardrails: { ...DEFAULT_GUARDRAILS, maxScans: 5 },
          },
        },
      },
      result: {
        data: {
          runAiScan: {
            id: 'air_2',
            status: 'QUEUED',
            target: '1.2.3.4',
            strategy: 'SINGLE_HOST',
          },
        },
      },
    };

    renderPage([runMock]);
    fireEvent.change(screen.getByLabelText('target'), { target: { value: '1.2.3.4' } });

    // Open the guardrails panel and edit Max scans.
    fireEvent.click(screen.getByText('Guardrails'));
    const maxScans = await screen.findByLabelText('Max scans');
    fireEvent.change(maxScans, { target: { value: '5' } });
    expect((maxScans as HTMLInputElement).value).toBe('5');

    fireEvent.click(screen.getByRole('button', { name: /hunt/i }));

    // Navigation only happens if the mock (with maxScans:5 vars) matched.
    await waitFor(() => expect(screen.getByText('RUN PAGE')).toBeInTheDocument());
  });
});
