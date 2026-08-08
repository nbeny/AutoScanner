import { describe, expect, it } from 'vitest';
import { MockedProvider, type MockedResponse } from '@apollo/client/testing';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { KALI_TOOL_RUNS_QUERY } from '../../../lib/graphql/queries';
import { KaliRunHistory } from '../kali-run-history';

function renderWith(mocks: MockedResponse[], engagementId?: string) {
  return render(
    <MockedProvider mocks={mocks} addTypename={false}>
      <MemoryRouter>
        <KaliRunHistory engagementId={engagementId} />
      </MemoryRouter>
    </MockedProvider>,
  );
}

function run(over: Record<string, unknown> = {}) {
  return {
    id: 'run-1',
    binary: 'nmap',
    args: ['-sV', '10.0.0.1'],
    status: 'COMPLETED',
    outputFormat: 'TEXT',
    exitCode: 0,
    createdAt: '2026-08-08T10:00:00.000Z',
    ...over,
  };
}

describe('<KaliRunHistory />', () => {
  it('renders nothing without an engagement', () => {
    const { container } = renderWith([], undefined);
    expect(container).toBeEmptyDOMElement();
  });

  it('lists past runs with status and links each to its detail page', async () => {
    const mock: MockedResponse = {
      request: { query: KALI_TOOL_RUNS_QUERY, variables: { engagementId: 'eng-1' } },
      result: {
        data: {
          kaliToolRuns: [
            run(),
            run({ id: 'run-2', binary: 'ffuf', status: 'FAILED', exitCode: 1 }),
          ],
        },
      },
    };
    renderWith([mock], 'eng-1');

    expect(await screen.findByText('nmap')).toBeInTheDocument();
    expect(screen.getByText('COMPLETED')).toBeInTheDocument();
    expect(screen.getByText('FAILED')).toBeInTheDocument();
    expect(screen.getByText('nmap').closest('a')).toHaveAttribute('href', '/runner/run-1');
  });

  it('shows an empty state when there are no runs', async () => {
    const mock: MockedResponse = {
      request: { query: KALI_TOOL_RUNS_QUERY, variables: { engagementId: 'eng-1' } },
      result: { data: { kaliToolRuns: [] } },
    };
    renderWith([mock], 'eng-1');
    expect(await screen.findByText(/Aucun run/)).toBeInTheDocument();
  });
});
