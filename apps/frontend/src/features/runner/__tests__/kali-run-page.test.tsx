// apps/frontend/src/features/runner/__tests__/kali-run-page.test.tsx
import { describe, expect, it, vi } from 'vitest';
import { MockedProvider } from '@apollo/client/testing';
import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import { KALI_TOOL_RUN_QUERY } from '../../../lib/graphql/queries';
import { KaliRunPage } from '../kali-run-page';

vi.mock('react-router-dom', async (orig) => ({
  ...(await orig<typeof import('react-router-dom')>()),
  useParams: () => ({ runId: 'r1' }),
}));

const runMock = {
  request: { query: KALI_TOOL_RUN_QUERY, variables: { id: 'r1' } },
  result: {
    data: {
      kaliToolRun: {
        id: 'r1',
        engagementId: 'e1',
        binary: 'nmap',
        args: ['-sV', 'scanme.example.com'],
        target: 'scanme.example.com',
        status: 'COMPLETED',
        outputFormat: 'json',
        parsedJson: { format: 'json', view: { host: 'up' } },
        exitCode: 0,
        errorMessage: null,
        createdAt: '2026-08-08T00:00:00.000Z',
      },
    },
  },
};

describe('<KaliRunPage />', () => {
  it('renders the run and its parsed result', async () => {
    render(
      <MemoryRouter>
        <MockedProvider mocks={[runMock]} addTypename={false}>
          <KaliRunPage />
        </MockedProvider>
      </MemoryRouter>,
    );
    expect(await screen.findByText('COMPLETED')).toBeInTheDocument();
    expect(screen.getByLabelText('tool-result-json').textContent).toContain('"host": "up"');
  });
});
