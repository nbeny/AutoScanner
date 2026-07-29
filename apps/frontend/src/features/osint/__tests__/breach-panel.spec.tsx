import { describe, expect, it } from 'vitest';
import { MockedProvider } from '@apollo/client/testing';
import { render, screen, waitFor } from '@testing-library/react';
import { BREACH_EXPOSURES_QUERY } from '../../../lib/graphql/queries';
import { BreachPanel } from '../breach-panel';

describe('<BreachPanel />', () => {
  it('prompts to pick a scope when no engagement is selected', () => {
    render(
      <MockedProvider mocks={[]} addTypename={false}>
        <BreachPanel engagementId={undefined} />
      </MockedProvider>,
    );
    expect(screen.getByText('Sélectionne un périmètre.')).toBeInTheDocument();
  });

  it('renders a breach exposure row with its severity and password badge', async () => {
    const mocks = [
      {
        request: { query: BREACH_EXPOSURES_QUERY, variables: { engagementId: 'eng-1' } },
        result: {
          data: {
            breachExposures: [
              {
                id: 'be-1',
                seed: 'neo@matrix.io',
                breachName: 'Collection1',
                breachDate: '2019-01-07',
                dataClasses: ['Emails', 'Passwords'],
                passwordExposed: true,
                severity: 'HIGH',
                source: 'intelx',
                lastSeenAt: '2026-07-28',
              },
            ],
          },
        },
      },
    ];
    render(
      <MockedProvider mocks={mocks} addTypename={false}>
        <BreachPanel engagementId="eng-1" />
      </MockedProvider>,
    );
    await waitFor(() => expect(screen.getByText('Collection1')).toBeInTheDocument());
    expect(screen.getByText('neo@matrix.io')).toBeInTheDocument();
    expect(screen.getByText('HIGH')).toBeInTheDocument();
    expect(screen.getByText('🔑 password')).toBeInTheDocument();
  });

  it('shows an empty state when no breach exposures are found', async () => {
    const mocks = [
      {
        request: { query: BREACH_EXPOSURES_QUERY, variables: { engagementId: 'eng-1' } },
        result: { data: { breachExposures: [] } },
      },
    ];
    render(
      <MockedProvider mocks={mocks} addTypename={false}>
        <BreachPanel engagementId="eng-1" />
      </MockedProvider>,
    );
    expect(
      await screen.findByText('Aucune fuite de données trouvée pour l’instant.'),
    ).toBeInTheDocument();
  });
});
