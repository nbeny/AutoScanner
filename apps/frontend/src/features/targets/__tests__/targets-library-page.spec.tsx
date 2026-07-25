import { describe, expect, it } from 'vitest';
import { MockedProvider } from '@apollo/client/testing';
import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import { ScopeProvider, type ScopeStorage } from '../../../lib/scope-context';
import { TargetsLibraryPage } from '../targets-library-page';

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

describe('<TargetsLibraryPage />', () => {
  it('renders the library heading and the scored assets panel', () => {
    render(
      <MockedProvider mocks={[]} addTypename={false}>
        <ScopeProvider storage={scope(null)}>
          <MemoryRouter>
            <TargetsLibraryPage />
          </MemoryRouter>
        </ScopeProvider>
      </MockedProvider>,
    );
    expect(screen.getByLabelText('targets-library')).toBeInTheDocument();
    expect(screen.getByText(/Bibliothèque de cibles/i)).toBeInTheDocument();
  });
});
