import { describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { MockedProvider } from '@apollo/client/testing';
import { render, screen, waitFor } from '@testing-library/react';
import {
  ENGAGEMENT_OVERVIEW_QUERY,
  RECENT_TEMPLATE_RUNS_QUERY,
  TOP_ASSETS_QUERY,
  TOP_FINDINGS_QUERY,
} from '../../../../lib/graphql/queries';
import { EngagementSynthesisPage } from '../engagement-synthesis-page';

const engagementId = 'eng_1';

const mocks = [
  {
    request: { query: ENGAGEMENT_OVERVIEW_QUERY, variables: { engagementId } },
    result: {
      data: {
        engagementOverview: {
          __typename: 'EngagementOverviewObject',
          domains: 1,
          subdomains: 2,
          ipAddresses: 3,
          openPorts: 4,
          uniqueTechs: 5,
          findingsBySeverity: {
            __typename: 'SeverityCountsObject',
            critical: 0,
            high: 0,
            medium: 0,
            low: 0,
            info: 0,
          },
        },
      },
    },
  },
  {
    request: { query: TOP_FINDINGS_QUERY, variables: { engagementId, limit: 10 } },
    result: { data: { topFindings: [] } },
  },
  {
    request: { query: TOP_ASSETS_QUERY, variables: { engagementId, limit: 10 } },
    result: { data: { topAssets: [] } },
  },
  {
    request: { query: RECENT_TEMPLATE_RUNS_QUERY, variables: { engagementId, limit: 5 } },
    result: { data: { recentTemplateRuns: [] } },
  },
];

describe('<EngagementSynthesisPage />', () => {
  it('composes the 5 widgets and surfaces all four queries', async () => {
    render(
      <MemoryRouter>
        <MockedProvider mocks={mocks}>
          <EngagementSynthesisPage engagementId={engagementId} />
        </MockedProvider>
      </MemoryRouter>,
    );

    await waitFor(() =>
      expect(screen.getByLabelText('attack-surface-counters-container')).toBeInTheDocument(),
    );
    expect(screen.getByLabelText('severity-donut-container')).toBeInTheDocument();
    expect(screen.getByLabelText('top-findings-container')).toBeInTheDocument();
    expect(screen.getByLabelText('top-assets-container')).toBeInTheDocument();
    expect(screen.getByLabelText('recent-template-runs-container')).toBeInTheDocument();
  });
});
