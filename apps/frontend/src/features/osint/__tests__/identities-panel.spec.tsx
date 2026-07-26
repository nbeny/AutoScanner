import { describe, expect, it } from 'vitest';
import { MockedProvider } from '@apollo/client/testing';
import { render, screen, waitFor } from '@testing-library/react';
import { IDENTITIES_QUERY } from '../../../lib/graphql/queries';
import { IdentitiesPanel } from '../identities-panel';

describe('<IdentitiesPanel />', () => {
  it('prompts to pick a scope when no engagement is selected', () => {
    render(
      <MockedProvider mocks={[]} addTypename={false}>
        <IdentitiesPanel engagementId={undefined} />
      </MockedProvider>,
    );
    expect(screen.getByText('Sélectionne un périmètre.')).toBeInTheDocument();
  });

  it('renders discovered accounts with their service and seed', async () => {
    const mocks = [
      {
        request: { query: IDENTITIES_QUERY, variables: { engagementId: 'eng-1', seed: undefined } },
        result: {
          data: {
            identities: [
              {
                id: 'id-1',
                kind: 'USERNAME',
                seed: 'neo',
                service: 'github',
                url: 'https://github.com/neo',
                source: 'maigret',
                lastSeenAt: '2026-07-26',
              },
            ],
          },
        },
      },
    ];
    render(
      <MockedProvider mocks={mocks} addTypename={false}>
        <IdentitiesPanel engagementId="eng-1" />
      </MockedProvider>,
    );
    await waitFor(() => expect(screen.getByText('github')).toBeInTheDocument());
    expect(screen.getByText('neo')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'https://github.com/neo' })).toBeInTheDocument();
  });
});
