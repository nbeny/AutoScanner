import { describe, expect, it, vi } from 'vitest';
import { MockedProvider } from '@apollo/client/testing';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SCANNER_CATALOG_QUERY, TOOL_ACTIVITY_QUERY } from '../../../lib/graphql/queries';
import { ToolsGrid } from '../tools-grid';

const CATALOG_MOCK = {
  request: { query: SCANNER_CATALOG_QUERY },
  result: {
    data: {
      scannerCatalog: [
        {
          __typename: 'ScannerCatalogEntryObject',
          name: 'nmap',
          displayName: 'nmap',
          description: 'Network scanner',
          categories: ['port-scan'],
          requiresCredential: null,
          fields: [],
        },
        {
          __typename: 'ScannerCatalogEntryObject',
          name: 'nuclei',
          displayName: 'nuclei',
          description: 'Vuln scanner',
          categories: ['vuln-scan'],
          requiresCredential: null,
          fields: [],
        },
      ],
    },
  },
};

const NMAP_ACTIVITY_MOCK = {
  request: {
    query: TOOL_ACTIVITY_QUERY,
    variables: { engagementId: null },
  },
  result: {
    data: {
      toolActivity: [
        {
          __typename: 'ToolActivityObject',
          scannerName: 'nmap',
          totalExecutions: 3,
          successCount: 2,
          failureCount: 1,
          medianDurationMs: 1200,
          totalFindings: 5,
          lastRunAt: '2024-01-15T10:30:00.000Z',
          findingsBySeverity: {
            __typename: 'SeverityCountsObject',
            critical: 1,
            high: 2,
            medium: 1,
            low: 1,
            info: 0,
          },
        },
      ],
    },
  },
};

describe('<ToolsGrid />', () => {
  it('shows the whole catalogue: nmap with stats, nuclei as never-run', async () => {
    render(
      <MockedProvider mocks={[CATALOG_MOCK, NMAP_ACTIVITY_MOCK]}>
        <ToolsGrid />
      </MockedProvider>,
    );

    await waitFor(() => expect(screen.getByLabelText('tools-grid')).toBeInTheDocument());
    expect(screen.getByText('nmap')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('nuclei')).toBeInTheDocument();
    expect(screen.getByText('Jamais exécuté')).toBeInTheDocument();
  });

  it('calls onSelectTool with the scanner name when the card is clicked', async () => {
    const onSelectTool = vi.fn();
    render(
      <MockedProvider mocks={[CATALOG_MOCK, NMAP_ACTIVITY_MOCK]}>
        <ToolsGrid onSelectTool={onSelectTool} />
      </MockedProvider>,
    );

    await waitFor(() => expect(screen.getByText('nmap')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /^nmap$/i }));
    expect(onSelectTool).toHaveBeenCalledWith('nmap');
  });
});
