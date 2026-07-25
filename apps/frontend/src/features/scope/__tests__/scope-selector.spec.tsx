import { describe, expect, it } from 'vitest';
import { MockedProvider } from '@apollo/client/testing';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ENGAGEMENTS_QUERY } from '../../../lib/graphql/queries';
import { ScopeProvider, useScope, type ScopeStorage } from '../../../lib/scope-context';
import { ScopeSelector } from '../scope-selector';

function makeMemoryStorage(initial: string | null = null): ScopeStorage {
  let value = initial;
  return {
    read: () => value,
    write: (id) => {
      value = id;
    },
    clear: () => {
      value = null;
    },
  };
}

const mocks = [
  {
    request: { query: ENGAGEMENTS_QUERY },
    result: {
      data: {
        engagements: [
          {
            id: 'eng-1',
            name: 'Quick Scans',
            clientName: null,
            status: 'ACTIVE',
            createdAt: '2026-01-01',
          },
          {
            id: 'eng-2',
            name: 'Client X',
            clientName: 'X',
            status: 'ACTIVE',
            createdAt: '2026-01-02',
          },
        ],
      },
    },
  },
];

function CurrentScope() {
  const { engagementId } = useScope();
  return <span data-testid="scope">{engagementId ?? 'none'}</span>;
}

describe('<ScopeSelector />', () => {
  it('lists engagements and sets the scope on selection', async () => {
    render(
      <MockedProvider mocks={mocks} addTypename={false}>
        <ScopeProvider storage={makeMemoryStorage(null)}>
          <ScopeSelector />
          <CurrentScope />
        </ScopeProvider>
      </MockedProvider>,
    );

    await waitFor(() =>
      expect(screen.getByRole('option', { name: 'Client X' })).toBeInTheDocument(),
    );

    fireEvent.change(screen.getByLabelText('scope-selector'), { target: { value: 'eng-2' } });
    expect(screen.getByTestId('scope')).toHaveTextContent('eng-2');
  });
});
