import { describe, expect, it } from 'vitest';
import { MockedProvider } from '@apollo/client/testing';
import { render, screen, waitFor } from '@testing-library/react';
import { TOOL_ACTIVITY_QUERY } from '../../../lib/graphql/queries';
import { ToolCategoryBreakdownCard } from '../tool-category-breakdown-card';

function makeToolMock() {
  return {
    request: {
      query: TOOL_ACTIVITY_QUERY,
      variables: { engagementId: null },
    },
    result: {
      data: {
        toolActivity: [
          {
            __typename: 'ToolActivityObject',
            scannerName: 'nuclei',
            totalExecutions: 5,
            successCount: 5,
            failureCount: 0,
            medianDurationMs: 200,
            totalFindings: 20,
            lastRunAt: '2026-06-01T00:00:00Z',
            findingsBySeverity: {
              __typename: 'SeverityCountsObject',
              critical: 3,
              high: 7,
              medium: 5,
              low: 3,
              info: 2,
            },
          },
          {
            __typename: 'ToolActivityObject',
            scannerName: 'nmap',
            totalExecutions: 3,
            successCount: 3,
            failureCount: 0,
            medianDurationMs: 150,
            totalFindings: 10,
            lastRunAt: '2026-06-01T00:00:00Z',
            findingsBySeverity: {
              __typename: 'SeverityCountsObject',
              critical: 1,
              high: 2,
              medium: 3,
              low: 2,
              info: 2,
            },
          },
        ],
      },
    },
  };
}

describe('<ToolCategoryBreakdownCard />', () => {
  it('renders heading and stacked chart container after data loads', async () => {
    render(
      <MockedProvider mocks={[makeToolMock()]}>
        <ToolCategoryBreakdownCard />
      </MockedProvider>,
    );

    await waitFor(() => expect(screen.getByLabelText('tool-category-card')).toBeInTheDocument());
    expect(screen.getByText("Findings par catégorie d'outil")).toBeInTheDocument();
    // chart renders svg
    expect(document.querySelector('[aria-label="tool-category-card"] svg')).toBeTruthy();
  });

  it('shows loading state initially', () => {
    render(
      <MockedProvider mocks={[makeToolMock()]}>
        <ToolCategoryBreakdownCard />
      </MockedProvider>,
    );
    expect(screen.getByText(/chargement/i)).toBeInTheDocument();
  });

  it('shows empty state when no tool activity', async () => {
    const emptyMock = {
      request: {
        query: TOOL_ACTIVITY_QUERY,
        variables: { engagementId: null },
      },
      result: {
        data: { toolActivity: [] },
      },
    };
    render(
      <MockedProvider mocks={[emptyMock]}>
        <ToolCategoryBreakdownCard />
      </MockedProvider>,
    );
    await waitFor(() => expect(screen.getByText(/aucune donnée/i)).toBeInTheDocument());
  });
});
