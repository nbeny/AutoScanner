import { describe, expect, it } from 'vitest';
import { MockedProvider } from '@apollo/client/testing';
import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import { ScopeProvider, type ScopeStorage } from '../../../lib/scope-context';
import { CockpitPage } from '../cockpit-page';

function scope(initial: string | null): ScopeStorage {
  let v = initial;
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

describe('<CockpitPage />', () => {
  it('renders the command bar and the three columns', () => {
    render(
      <MockedProvider mocks={[]} addTypename={false}>
        <ScopeProvider storage={scope('eng-1')}>
          <MemoryRouter>
            <CockpitPage />
          </MemoryRouter>
        </ScopeProvider>
      </MockedProvider>,
    );
    expect(screen.getByLabelText('cockpit-command-bar')).toBeInTheDocument();
    expect(screen.getByLabelText('active-scanners')).toBeInTheDocument();
    expect(screen.getByLabelText('focus-empty')).toBeInTheDocument();
    expect(screen.getByLabelText('queues-workers')).toBeInTheDocument();
  });
});
