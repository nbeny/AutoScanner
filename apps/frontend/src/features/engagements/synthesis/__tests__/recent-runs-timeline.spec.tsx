import { describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { MockedProvider } from '@apollo/client/testing';
import { render, screen, waitFor } from '@testing-library/react';
import { RECENT_TEMPLATE_RUNS_QUERY } from '../../../../lib/graphql/queries';
import { RecentRunsTimeline } from '../recent-runs-timeline';

const engagementId = 'eng_1';

function mockRuns(items: unknown[]) {
  return {
    request: { query: RECENT_TEMPLATE_RUNS_QUERY, variables: { engagementId, limit: 5 } },
    result: { data: { recentTemplateRuns: items } },
  };
}

describe('<RecentRunsTimeline />', () => {
  it('renders run rows with template name, status, and delta counts', async () => {
    render(
      <MemoryRouter>
        <MockedProvider
          mocks={[
            mockRuns([
              {
                __typename: 'RecentTemplateRunObject',
                id: 'r1',
                templateName: 'web-quick',
                status: 'COMPLETED',
                startedAt: '2026-05-31T10:00:00Z',
                completedAt: '2026-05-31T10:05:00Z',
                durationMs: 5 * 60 * 1000,
                newAssetsCount: 12,
                newFindingsCount: 3,
              },
            ]),
          ]}
        >
          <RecentRunsTimeline engagementId={engagementId} />
        </MockedProvider>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText('web-quick')).toBeInTheDocument());
    expect(screen.getByText('COMPLETED')).toBeInTheDocument();
    expect(screen.getByText('+12 assets')).toBeInTheDocument();
    expect(screen.getByText('+3 findings')).toBeInTheDocument();
    expect(screen.getByText('5m 0s')).toBeInTheDocument();
  });

  it('shows "running…" when durationMs is null and status is RUNNING', async () => {
    render(
      <MemoryRouter>
        <MockedProvider
          mocks={[
            mockRuns([
              {
                __typename: 'RecentTemplateRunObject',
                id: 'r1',
                templateName: 'recon-active',
                status: 'RUNNING',
                startedAt: '2026-05-31T10:00:00Z',
                completedAt: null,
                durationMs: null,
                newAssetsCount: 0,
                newFindingsCount: 0,
              },
            ]),
          ]}
        >
          <RecentRunsTimeline engagementId={engagementId} />
        </MockedProvider>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText(/running…/i)).toBeInTheDocument());
  });

  it('empty state when no runs', async () => {
    render(
      <MemoryRouter>
        <MockedProvider mocks={[mockRuns([])]}>
          <RecentRunsTimeline engagementId={engagementId} />
        </MockedProvider>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText(/No template runs yet/i)).toBeInTheDocument());
  });
});
