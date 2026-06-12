import { describe, expect, it } from 'vitest';
import { MockedProvider } from '@apollo/client/testing';
import { render, screen, waitFor } from '@testing-library/react';

import { REPORTS_QUERY } from '../../../lib/graphql/queries';
import { RecentReportsPanel } from '../recent-reports-panel';

const engagementId = 'eng_1';

function row(overrides: Partial<{ id: string; status: string; sizeBytes: number | null }>) {
  return {
    __typename: 'Report',
    id: overrides.id ?? 'r1',
    format: 'JSON',
    status: overrides.status ?? 'READY',
    sizeBytes: overrides.sizeBytes ?? 4096,
    contentType: 'application/json',
    errorMessage: null,
    createdAt: '2026-06-12T10:00:00Z',
    startedAt: '2026-06-12T10:00:01Z',
    completedAt: '2026-06-12T10:00:05Z',
    downloadUrl: null,
    template: {
      __typename: 'ReportTemplate',
      id: 't1',
      slug: 'json-full-export',
      name: 'JSON export',
      format: 'JSON',
    },
  };
}

function mockReports(items: ReturnType<typeof row>[]) {
  return {
    request: { query: REPORTS_QUERY, variables: { engagementId } },
    result: { data: { reports: items } },
  };
}

describe('<RecentReportsPanel />', () => {
  it('shows a download link for READY reports', async () => {
    render(
      <MockedProvider mocks={[mockReports([row({ id: 'rep_ready', status: 'READY' })])]}>
        <RecentReportsPanel engagementId={engagementId} />
      </MockedProvider>,
    );
    await waitFor(() =>
      expect(screen.getByRole('link', { name: /télécharger/i })).toHaveAttribute(
        'href',
        '/reports/rep_ready/download',
      ),
    );
  });

  it('hides the download link for PENDING/GENERATING reports', async () => {
    render(
      <MockedProvider
        mocks={[
          mockReports([
            row({ id: 'rep_pending', status: 'PENDING' }),
            row({ id: 'rep_gen', status: 'GENERATING' }),
          ]),
        ]}
      >
        <RecentReportsPanel engagementId={engagementId} />
      </MockedProvider>,
    );
    await waitFor(() => expect(screen.getByText('PENDING')).toBeInTheDocument());
    expect(screen.queryByRole('link', { name: /télécharger/i })).not.toBeInTheDocument();
  });

  it('shows error message for FAILED reports', async () => {
    const failed = {
      ...row({ id: 'rep_failed', status: 'FAILED' }),
      errorMessage: 'chromium crashed',
    };
    render(
      <MockedProvider mocks={[mockReports([failed])]}>
        <RecentReportsPanel engagementId={engagementId} />
      </MockedProvider>,
    );
    await waitFor(() => expect(screen.getByText(/chromium crashed/i)).toBeInTheDocument());
  });

  it('renders empty state when no reports', async () => {
    render(
      <MockedProvider mocks={[mockReports([])]}>
        <RecentReportsPanel engagementId={engagementId} />
      </MockedProvider>,
    );
    await waitFor(() =>
      expect(screen.getByText(/aucun rapport pour cet engagement/i)).toBeInTheDocument(),
    );
  });
});
