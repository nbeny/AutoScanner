import { describe, expect, it } from 'vitest';
import { MockedProvider } from '@apollo/client/testing';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { render, screen, waitFor } from '@testing-library/react';
import { ENGAGEMENTS_QUERY } from '../../lib/graphql/queries';
import { ScopeProvider, type ScopeStorage } from '../../lib/scope-context';
import { AppShell } from '../app-shell';

function mem(): ScopeStorage {
  let v: string | null = null;
  return {
    read: () => v,
    write: (id) => {
      v = id;
    },
    clear: () => {
      v = null;
    },
  };
}

const engagementsMock = {
  request: { query: ENGAGEMENTS_QUERY },
  result: {
    data: {
      engagements: [
        {
          id: 'e1',
          name: 'Quick Scans',
          clientName: 'AutoHunt',
          status: 'ACTIVE',
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    },
  },
};

describe('<AppShell />', () => {
  it('renders the nav rail, topbar, the routed child, and auto-resolves the périmètre', async () => {
    render(
      <MockedProvider mocks={[engagementsMock]} addTypename={false}>
        <ScopeProvider storage={mem()}>
          <MemoryRouter initialEntries={['/']}>
            <Routes>
              <Route element={<AppShell email="op@example.com" onLogout={() => undefined} />}>
                <Route path="/" element={<div>child content</div>} />
              </Route>
            </Routes>
          </MemoryRouter>
        </ScopeProvider>
      </MockedProvider>,
    );
    expect(screen.getByRole('navigation', { name: 'primary' })).toBeInTheDocument();
    expect(screen.getByLabelText('topbar')).toBeInTheDocument();
    expect(screen.getByText('child content')).toBeInTheDocument();
    // The sole engagement is auto-selected and surfaced in the topbar.
    await waitFor(() =>
      expect(screen.getByLabelText('active-scope')).toHaveTextContent('Quick Scans'),
    );
  });
});
