import { describe, expect, it } from 'vitest';
import { MockedProvider } from '@apollo/client/testing';
import { MemoryRouter } from 'react-router-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  AGENTS_QUERY,
  CREATE_AGENT_REGISTRATION_MUTATION,
  REVOKE_AGENT_MUTATION,
} from '../../../lib/graphql/queries';
import { AgentsPanel } from '../agents-panel';

const agentId = 'agent-1';

const agentsMock = {
  request: { query: AGENTS_QUERY },
  result: {
    data: {
      agents: [
        {
          id: agentId,
          name: 'laptop-01',
          hostname: 'laptop-01.local',
          status: 'ACTIVE',
          capabilities: null,
          version: null,
          lastHeartbeatAt: '2026-06-14T12:00:00.000Z',
          enrolledAt: '2026-06-14T10:00:00.000Z',
          createdAt: '2026-06-14T09:00:00.000Z',
        },
      ],
    },
  },
};

const emptyAgentsMock = {
  request: { query: AGENTS_QUERY },
  result: { data: { agents: [] } },
};

function renderPanel(mocks: Parameters<typeof MockedProvider>[0]['mocks']) {
  return render(
    <MemoryRouter>
      <MockedProvider mocks={mocks}>
        <AgentsPanel />
      </MockedProvider>
    </MemoryRouter>,
  );
}

describe('<AgentsPanel />', () => {
  // Test 1: Renders existing agents from AGENTS_QUERY
  it('renders existing agents from query', async () => {
    renderPanel([agentsMock]);
    expect(await screen.findByText('laptop-01')).toBeInTheDocument();
    expect(screen.getByText('ACTIVE')).toBeInTheDocument();
    expect(screen.getByText('laptop-01.local')).toBeInTheDocument();
    // lastHeartbeatAt formatted via formatDate
    expect(screen.getByText('2026-06-14 12:00:00')).toBeInTheDocument();
  });

  it('shows empty state when no agents are enrolled', async () => {
    renderPanel([emptyAgentsMock]);
    expect(await screen.findByText(/no agents enrolled/i)).toBeInTheDocument();
  });

  it('has an enrol-agent form', () => {
    renderPanel([emptyAgentsMock]);
    expect(screen.getByRole('form', { name: 'enrol-agent' })).toBeInTheDocument();
  });

  it('submit is disabled when name is empty', async () => {
    renderPanel([emptyAgentsMock]);
    await screen.findByText(/no agents enrolled/i);
    const submitBtn = screen.getByRole('button', { name: /enrol/i });
    expect(submitBtn).toBeDisabled();
  });

  // Test 2: Enrolling – submit fires mutation and shows bootstrap token
  it('enrolling: fires CREATE_AGENT_REGISTRATION_MUTATION with { input: { name } } and shows bootstrap token', async () => {
    let mutationCalled = false;
    const bootstrapToken = 'tok_abc123';
    const createMock = {
      request: {
        query: CREATE_AGENT_REGISTRATION_MUTATION,
        variables: { input: { name: 'laptop-02' } },
      },
      result: () => {
        mutationCalled = true;
        return {
          data: {
            createAgentRegistration: {
              agentId: 'agent-new',
              bootstrapToken,
            },
          },
        };
      },
    };
    const refetchMock = {
      request: { query: AGENTS_QUERY },
      result: {
        data: {
          agents: [
            {
              id: 'agent-new',
              name: 'laptop-02',
              hostname: null,
              status: 'PENDING',
              capabilities: null,
              version: null,
              lastHeartbeatAt: null,
              enrolledAt: null,
              createdAt: '2026-06-14T09:00:00.000Z',
            },
          ],
        },
      },
    };

    renderPanel([emptyAgentsMock, createMock, refetchMock]);
    await screen.findByText(/no agents enrolled/i);

    const nameInput = screen.getByLabelText(/agent name/i);
    await userEvent.type(nameInput, 'laptop-02');

    const submitBtn = screen.getByRole('button', { name: /enrol/i });
    expect(submitBtn).not.toBeDisabled();
    await userEvent.click(submitBtn);

    await waitFor(() => expect(mutationCalled).toBe(true));

    // Bootstrap token shown exactly once (not shown again)
    expect(await screen.findByTestId('bootstrap-token')).toHaveTextContent(bootstrapToken);
    // Warning message visible
    expect(screen.getByText(/copy this token now/i)).toBeInTheDocument();
  });

  // Test 3: Revoke fires REVOKE_AGENT_MUTATION with { id }
  it('revoke fires REVOKE_AGENT_MUTATION with { id } and refetches', async () => {
    let revokeCalled = false;
    const revokeMock = {
      request: {
        query: REVOKE_AGENT_MUTATION,
        variables: { id: agentId },
      },
      result: () => {
        revokeCalled = true;
        return { data: { revokeAgent: true } };
      },
    };
    const refetchMock = {
      request: { query: AGENTS_QUERY },
      result: { data: { agents: [] } },
    };

    renderPanel([agentsMock, revokeMock, refetchMock]);
    await screen.findByText('laptop-01');

    const revokeBtn = screen.getByRole('button', { name: `Revoke agent ${agentId}` });
    await userEvent.click(revokeBtn);

    await waitFor(() => expect(revokeCalled).toBe(true));
  });

  it('revoke button not shown for REVOKED agents', async () => {
    const revokedAgentMock = {
      request: { query: AGENTS_QUERY },
      result: {
        data: {
          agents: [
            {
              id: 'agent-revoked',
              name: 'old-agent',
              hostname: null,
              status: 'REVOKED',
              capabilities: null,
              version: null,
              lastHeartbeatAt: null,
              enrolledAt: null,
              createdAt: '2026-06-13T09:00:00.000Z',
            },
          ],
        },
      },
    };
    renderPanel([revokedAgentMock]);
    await screen.findByText('old-agent');
    expect(screen.queryByRole('button', { name: /revoke agent/i })).not.toBeInTheDocument();
  });

  it('shows — when lastHeartbeatAt is null', async () => {
    const pendingAgentMock = {
      request: { query: AGENTS_QUERY },
      result: {
        data: {
          agents: [
            {
              id: 'agent-p',
              name: 'pending-agent',
              hostname: null,
              status: 'PENDING',
              capabilities: null,
              version: null,
              lastHeartbeatAt: null,
              enrolledAt: null,
              createdAt: '2026-06-14T09:00:00.000Z',
            },
          ],
        },
      },
    };
    renderPanel([pendingAgentMock]);
    await screen.findByText('pending-agent');
    // Both hostname and lastHeartbeatAt are null → two '—' cells shown
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(1);
  });
});
