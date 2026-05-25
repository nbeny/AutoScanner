import { describe, expect, it } from 'vitest';
import { MockedProvider } from '@apollo/client/testing';
import { MemoryRouter } from 'react-router-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CREATE_ENGAGEMENT_MUTATION, ENGAGEMENTS_QUERY } from '../../../lib/graphql/queries';
import { EngagementsListPage } from '../engagements-list-page';

const engagementsMock = {
  request: { query: ENGAGEMENTS_QUERY },
  result: {
    data: {
      engagements: [
        {
          id: 'eng_1',
          name: 'Acme Recon',
          clientName: 'Acme',
          status: 'ACTIVE',
          createdAt: new Date().toISOString(),
        },
      ],
    },
  },
};

function renderPage(mocks: Parameters<typeof MockedProvider>[0]['mocks']) {
  return render(
    <MemoryRouter>
      <MockedProvider mocks={mocks}>
        <EngagementsListPage />
      </MockedProvider>
    </MemoryRouter>,
  );
}

describe('<EngagementsListPage />', () => {
  it('renders engagements from the query', async () => {
    renderPage([engagementsMock]);
    expect(screen.getByText('Loading…')).toBeInTheDocument();
    expect(await screen.findByText('Acme Recon')).toBeInTheDocument();
    expect(screen.getByText('Acme')).toBeInTheDocument();
    expect(screen.getByText('ACTIVE')).toBeInTheDocument();
  });

  it('submits the create-engagement mutation and refetches the list', async () => {
    const createMock = {
      request: {
        query: CREATE_ENGAGEMENT_MUTATION,
        variables: { input: { name: 'New', clientName: 'Acme' } },
      },
      result: {
        data: {
          createEngagement: {
            id: 'eng_2',
            name: 'New',
            clientName: 'Acme',
            status: 'PLANNED',
            createdAt: new Date().toISOString(),
          },
        },
      },
    };
    const refetchedMock = {
      request: { query: ENGAGEMENTS_QUERY },
      result: {
        data: {
          engagements: [
            ...engagementsMock.result.data.engagements,
            {
              id: 'eng_2',
              name: 'New',
              clientName: 'Acme',
              status: 'PLANNED',
              createdAt: new Date().toISOString(),
            },
          ],
        },
      },
    };

    renderPage([engagementsMock, createMock, refetchedMock]);

    await screen.findByText('Acme Recon');
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'New' } });
    fireEvent.change(screen.getByLabelText('Client'), { target: { value: 'Acme' } });
    fireEvent.submit(screen.getByRole('form', { name: 'create-engagement' }));

    await waitFor(() => expect(screen.getByText('New')).toBeInTheDocument());
  });
});
