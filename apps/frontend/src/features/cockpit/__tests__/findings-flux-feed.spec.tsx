import { describe, expect, it } from 'vitest';
import { MockedProvider } from '@apollo/client/testing';
import { render, screen, waitFor } from '@testing-library/react';
import { ENGAGEMENT_UPDATED_SUBSCRIPTION } from '../../../lib/graphql/queries';
import { FindingsFluxFeed } from '../findings-flux-feed';

const mocks = [
  {
    request: { query: ENGAGEMENT_UPDATED_SUBSCRIPTION, variables: { engagementId: 'eng-1' } },
    result: {
      data: {
        engagementUpdated: {
          kind: 'FINDING_RAISED',
          engagementId: 'eng-1',
          assetId: 'a1',
          templateRunId: null,
          severity: 'CRITICAL',
          title: 'RCE in upload',
          ts: '2026-01-01',
        },
      },
    },
  },
];

describe('<FindingsFluxFeed />', () => {
  it('prompts to pick a scope when engagementId is missing', () => {
    render(
      <MockedProvider mocks={[]} addTypename={false}>
        <FindingsFluxFeed engagementId={undefined} />
      </MockedProvider>,
    );
    expect(screen.getByLabelText('flux-no-scope')).toBeInTheDocument();
  });

  it('appends FINDING_RAISED events with severity and title', async () => {
    render(
      <MockedProvider mocks={mocks} addTypename={false}>
        <FindingsFluxFeed engagementId="eng-1" />
      </MockedProvider>,
    );
    await waitFor(() => expect(screen.getByText('RCE in upload')).toBeInTheDocument());
    expect(screen.getByText('CRITICAL')).toBeInTheDocument();
  });
});
