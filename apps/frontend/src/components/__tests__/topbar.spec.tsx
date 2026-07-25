import { describe, expect, it, vi } from 'vitest';
import { MockedProvider } from '@apollo/client/testing';
import { fireEvent, render, screen } from '@testing-library/react';
import { ScopeProvider, type ScopeStorage } from '../../lib/scope-context';
import { Topbar } from '../topbar';

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

describe('<Topbar />', () => {
  it('renders the brand, email, scope selector, and fires logout', () => {
    const onLogout = vi.fn();
    render(
      <MockedProvider mocks={[]} addTypename={false}>
        <ScopeProvider storage={mem()}>
          <Topbar email="op@example.com" onLogout={onLogout} />
        </ScopeProvider>
      </MockedProvider>,
    );
    expect(screen.getByText('AutoScanner')).toBeInTheDocument();
    expect(screen.getByText('op@example.com')).toBeInTheDocument();
    expect(screen.getByLabelText('scope-selector')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Logout' }));
    expect(onLogout).toHaveBeenCalledTimes(1);
  });
});
