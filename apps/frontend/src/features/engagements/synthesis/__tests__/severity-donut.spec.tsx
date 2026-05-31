import { describe, expect, it } from 'vitest';
import { MockedProvider } from '@apollo/client/testing';
import { render, screen, waitFor } from '@testing-library/react';
import { ENGAGEMENT_OVERVIEW_QUERY } from '../../../../lib/graphql/queries';
import { SeverityDonut } from '../severity-donut';

const engagementId = 'eng_1';

function mockOverview(
  counts: Partial<{
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
  }>,
) {
  return {
    request: { query: ENGAGEMENT_OVERVIEW_QUERY, variables: { engagementId } },
    result: {
      data: {
        engagementOverview: {
          __typename: 'EngagementOverviewObject',
          domains: 0,
          subdomains: 0,
          ipAddresses: 0,
          openPorts: 0,
          uniqueTechs: 0,
          findingsBySeverity: {
            __typename: 'SeverityCountsObject',
            critical: 0,
            high: 0,
            medium: 0,
            low: 0,
            info: 0,
            ...counts,
          },
        },
      },
    },
  };
}

describe('<SeverityDonut />', () => {
  it('renders the total findings count at the center', async () => {
    render(
      <MockedProvider mocks={[mockOverview({ critical: 2, high: 5, medium: 3 })]}>
        <SeverityDonut engagementId={engagementId} />
      </MockedProvider>,
    );
    await waitFor(() => expect(screen.getByLabelText('total-findings')).toHaveTextContent('10'));
  });

  it('shows an empty state when total = 0', async () => {
    render(
      <MockedProvider mocks={[mockOverview({})]}>
        <SeverityDonut engagementId={engagementId} />
      </MockedProvider>,
    );
    await waitFor(() => expect(screen.getByText(/No findings yet/i)).toBeInTheDocument());
  });

  it('renders one arc per non-zero severity (a11y: each labelled)', async () => {
    render(
      <MockedProvider mocks={[mockOverview({ critical: 2, high: 5, low: 1 })]}>
        <SeverityDonut engagementId={engagementId} />
      </MockedProvider>,
    );
    await waitFor(() => expect(screen.getByLabelText('arc-critical-2')).toBeInTheDocument());
    expect(screen.getByLabelText('arc-high-5')).toBeInTheDocument();
    expect(screen.getByLabelText('arc-low-1')).toBeInTheDocument();
    expect(screen.queryByLabelText(/arc-medium-/)).toBeNull();
    expect(screen.queryByLabelText(/arc-info-/)).toBeNull();
  });
});
