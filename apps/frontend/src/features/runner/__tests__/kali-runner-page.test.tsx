import { describe, expect, it, vi } from 'vitest';
import { MockedProvider } from '@apollo/client/testing';
import { MemoryRouter } from 'react-router-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  KALI_TOOLS_QUERY,
  KALI_TOOL_QUERY,
  RUN_KALI_TOOL_MUTATION,
} from '../../../lib/graphql/queries';
import { KaliRunnerPage } from '../kali-runner-page';

const navigate = vi.fn();
vi.mock('react-router-dom', async (orig) => ({
  ...(await orig<typeof import('react-router-dom')>()),
  useNavigate: () => navigate,
}));
vi.mock('../../../lib/scope-context', () => ({ useScope: () => ({ engagementId: 'e1' }) }));

const toolsMock = {
  request: { query: KALI_TOOLS_QUERY },
  result: {
    data: {
      kaliTools: [
        {
          binary: 'nmap',
          package: 'nmap',
          displayName: 'nmap',
          description: 'Network mapper',
          categories: ['information-gathering'],
          hasHelp: true,
          optionCount: 2,
        },
      ],
    },
  },
};
const toolMock = {
  request: { query: KALI_TOOL_QUERY, variables: { binary: 'nmap' } },
  result: {
    data: {
      kaliTool: {
        binary: 'nmap',
        displayName: 'nmap',
        description: 'Network mapper',
        homepage: 'https://nmap.org',
        helpTextRaw: 'Usage: nmap ...',
        parseConfidence: 'low',
        manAvailable: true,
        options: [{ flag: '-sV', argHint: null, description: 'version detect' }],
      },
    },
  },
};

describe('<KaliRunnerPage />', () => {
  it('lists tools, selects one, composes argv and runs', async () => {
    const runMock = {
      request: {
        query: RUN_KALI_TOOL_MUTATION,
        variables: {
          input: {
            engagementId: 'e1',
            binary: 'nmap',
            args: ['-sV', 'scanme.example.com'],
            jsonOutput: false,
          },
        },
      },
      result: {
        data: {
          runKaliTool: {
            id: 'r1',
            binary: 'nmap',
            args: ['-sV', 'scanme.example.com'],
            status: 'PENDING',
          },
        },
      },
    };
    render(
      <MemoryRouter>
        <MockedProvider mocks={[toolsMock, toolMock, runMock]} addTypename={false}>
          <KaliRunnerPage />
        </MockedProvider>
      </MemoryRouter>,
    );
    // pick the tool
    fireEvent.click(await screen.findByRole('button', { name: /nmap/i }));
    // type args
    fireEvent.change(await screen.findByLabelText('kali-args'), {
      target: { value: '-sV scanme.example.com' },
    });
    // run
    fireEvent.click(screen.getByRole('button', { name: /^run$/i }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/runner/r1'));
  });
});
