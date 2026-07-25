import { describe, expect, it } from 'vitest';
import { MockedProvider } from '@apollo/client/testing';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
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

describe('<AppShell />', () => {
  it('renders the nav rail, topbar, and the routed child via Outlet', () => {
    render(
      <MockedProvider mocks={[]} addTypename={false}>
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
  });
});
