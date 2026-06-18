import { describe, expect, it } from 'vitest';
import { MockedProvider } from '@apollo/client/testing';
import { MemoryRouter } from 'react-router-dom';
import { render, screen, waitFor } from '@testing-library/react';
import { ENGAGEMENT_SUMMARIES_QUERY } from '../../../lib/graphql/queries';
import { EngagementSummaryGrid } from '../engagement-summary-grid';

function mock(summaries: unknown[]) {
  return {
    request: { query: ENGAGEMENT_SUMMARIES_QUERY },
    result: { data: { engagementSummaries: summaries } },
  };
}

function summary(over: Record<string, unknown>) {
  return {
    __typename: 'EngagementSummaryObject',
    id: 'e1',
    name: 'Acme',
    clientName: 'Acme Corp',
    status: 'ACTIVE',
    createdAt: '2026-06-01T00:00:00.000Z',
    assetCount: 12,
    lastActivityAt: '2026-06-16T00:00:00.000Z',
    findingsBySeverity: {
      __typename: 'SeverityCountsObject',
      critical: 2,
      high: 0,
      medium: 0,
      low: 1,
      info: 0,
    },
    ...over,
  };
}

function renderGrid(mocks: ReturnType<typeof mock>[]) {
  return render(
    <MockedProvider mocks={mocks}>
      <MemoryRouter>
        <EngagementSummaryGrid />
      </MemoryRouter>
    </MockedProvider>,
  );
}

describe('<EngagementSummaryGrid />', () => {
  it('renders one linked card per engagement with status, assets and severity bar', async () => {
    renderGrid([mock([summary({ id: 'e1', name: 'Acme', assetCount: 12 })])]);

    await waitFor(() => expect(screen.getByLabelText('engagement-card-e1')).toBeInTheDocument());
    const card = screen.getByLabelText('engagement-card-e1');
    expect(card).toHaveAttribute('href', '/engagements/e1');
    expect(card).toHaveTextContent('Acme');
    expect(card).toHaveTextContent('12 assets');
    expect(screen.getByLabelText('bar-critical-2')).toBeInTheDocument();
  });

  it('shows the create-first empty state when no engagements exist', async () => {
    renderGrid([mock([])]);
    await waitFor(() =>
      expect(screen.getByText(/Create your first engagement/i)).toBeInTheDocument(),
    );
  });
});
