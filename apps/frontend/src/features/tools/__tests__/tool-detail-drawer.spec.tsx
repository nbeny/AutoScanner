import { describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { render, screen, waitFor } from '@testing-library/react';
import { MockedProvider } from '@apollo/client/testing';
import { TOOL_DETAIL_QUERY } from '../../../lib/graphql/queries';
import { ToolDetailDrawer } from '../tool-detail-drawer';

const toolDetailMock = {
  request: {
    query: TOOL_DETAIL_QUERY,
    variables: { engagementId: null, scannerName: 'nmap' },
  },
  result: {
    data: {
      toolDetail: {
        __typename: 'ToolDetailObject',
        scannerName: 'nmap',
        runs: [
          {
            __typename: 'ToolRunObject',
            scanJobId: 'j1',
            status: 'FAILED',
            durationMs: 3200,
            exitCode: 1,
            errorMessage: 'boom',
            completedAt: '2024-01-15T10:00:00.000Z',
            agentId: 'ag1',
          },
        ],
        recurringErrors: [
          {
            __typename: 'ToolErrorObject',
            message: 'boom',
            count: 1,
          },
        ],
        agents: [
          {
            __typename: 'ToolAgentStatObject',
            agentId: 'ag1',
            executions: 2,
            successCount: 1,
          },
        ],
      },
    },
  },
};

describe('<ToolDetailDrawer />', () => {
  it('renders nothing when scannerName is null', () => {
    const { container } = render(
      <MockedProvider mocks={[]}>
        <MemoryRouter>
          <ToolDetailDrawer scannerName={null} onClose={() => undefined} />
        </MemoryRouter>
      </MockedProvider>,
    );
    expect(container.querySelector('[aria-label="tool-detail-drawer"]')).toBeNull();
  });

  it('shows run status, recurring error and agent after load', async () => {
    render(
      <MockedProvider mocks={[toolDetailMock]}>
        <MemoryRouter>
          <ToolDetailDrawer scannerName="nmap" onClose={() => undefined} />
        </MemoryRouter>
      </MockedProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('FAILED')).toBeInTheDocument();
    });

    // 'boom' appears in the run error column AND the recurring errors list
    expect(screen.getAllByText('boom').length).toBeGreaterThanOrEqual(1);
    // 'ag1' appears in the run row AND in the agents table
    expect(screen.getAllByText('ag1').length).toBeGreaterThanOrEqual(1);
  });
});
