import { describe, expect, it } from 'vitest';
import { MockedProvider } from '@apollo/client/testing';
import { render, screen, waitFor } from '@testing-library/react';
import { TOOL_ACTIVITY_QUERY } from '../../../lib/graphql/queries';
import { TopToolsCard } from '../top-tools-card';

function makeToolMock(tools: { scannerName: string; totalFindings: number }[]) {
  return {
    request: {
      query: TOOL_ACTIVITY_QUERY,
      variables: { engagementId: null },
    },
    result: {
      data: {
        toolActivity: tools.map((t) => ({
          __typename: 'ToolActivityObject',
          scannerName: t.scannerName,
          totalExecutions: 1,
          successCount: 1,
          failureCount: 0,
          medianDurationMs: 100,
          totalFindings: t.totalFindings,
          lastRunAt: '2026-06-01T00:00:00Z',
          findingsBySeverity: {
            __typename: 'SeverityCountsObject',
            critical: 0,
            high: 0,
            medium: 0,
            low: 0,
            info: 0,
          },
        })),
      },
    },
  };
}

describe('<TopToolsCard />', () => {
  it('renders heading and top tools sorted by totalFindings', async () => {
    const mock = makeToolMock([
      { scannerName: 'nuclei', totalFindings: 50 },
      { scannerName: 'nmap', totalFindings: 10 },
      { scannerName: 'nikto', totalFindings: 30 },
    ]);

    render(
      <MockedProvider mocks={[mock]}>
        <TopToolsCard />
      </MockedProvider>,
    );

    await waitFor(() => expect(screen.getByLabelText('top-tools-card')).toBeInTheDocument());
    expect(screen.getByText('Top outils par findings')).toBeInTheDocument();
    // nuclei has most findings
    expect(screen.getByText('nuclei')).toBeInTheDocument();
    // nmap has fewer
    expect(screen.getByText('nmap')).toBeInTheDocument();
  });

  it('shows loading state initially', () => {
    const mock = makeToolMock([]);
    render(
      <MockedProvider mocks={[mock]}>
        <TopToolsCard />
      </MockedProvider>,
    );
    expect(screen.getByText(/chargement/i)).toBeInTheDocument();
  });

  it('shows empty state when no tool activity', async () => {
    const mock = makeToolMock([]);
    render(
      <MockedProvider mocks={[mock]}>
        <TopToolsCard />
      </MockedProvider>,
    );
    await waitFor(() => expect(screen.getByText(/aucun outil/i)).toBeInTheDocument());
  });

  it('takes only top 8 tools', async () => {
    const tools = Array.from({ length: 12 }, (_, i) => ({
      scannerName: `tool-${i}`,
      totalFindings: 12 - i,
    }));
    const mock = makeToolMock(tools);

    render(
      <MockedProvider mocks={[mock]}>
        <TopToolsCard />
      </MockedProvider>,
    );

    await waitFor(() => expect(screen.getByLabelText('top-tools-card')).toBeInTheDocument());
    // tool-0 has most findings (12), tool-7 has 5 — tool-8 has 4 (not shown)
    expect(screen.getByText('tool-0')).toBeInTheDocument();
    expect(screen.queryByText('tool-8')).not.toBeInTheDocument();
  });
});
