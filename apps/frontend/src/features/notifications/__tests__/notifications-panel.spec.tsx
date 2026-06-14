import { describe, expect, it } from 'vitest';
import { MockedProvider } from '@apollo/client/testing';
import { MemoryRouter } from 'react-router-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  NOTIFICATION_CHANNELS_QUERY,
  CREATE_NOTIFICATION_CHANNEL_MUTATION,
  TEST_NOTIFICATION_CHANNEL_MUTATION,
  UPDATE_NOTIFICATION_CHANNEL_MUTATION,
  DELETE_NOTIFICATION_CHANNEL_MUTATION,
} from '../../../lib/graphql/queries';
import { NotificationsPanel } from '../notifications-panel';

const channelId = 'ch-1';

const channelsMock = {
  request: { query: NOTIFICATION_CHANNELS_QUERY },
  result: {
    data: {
      notificationChannels: [
        {
          id: channelId,
          name: 'ops-slack',
          type: 'SLACK',
          enabled: true,
          eventFilters: ['scan.completed'],
          createdAt: '2026-01-01T10:00:00.000Z',
          updatedAt: '2026-01-01T10:00:00.000Z',
        },
      ],
    },
  },
};

const emptyChannelsMock = {
  request: { query: NOTIFICATION_CHANNELS_QUERY },
  result: { data: { notificationChannels: [] } },
};

function renderPanel(mocks: Parameters<typeof MockedProvider>[0]['mocks']) {
  return render(
    <MemoryRouter>
      <MockedProvider mocks={mocks} addTypename={false}>
        <NotificationsPanel />
      </MockedProvider>
    </MemoryRouter>,
  );
}

describe('<NotificationsPanel />', () => {
  // Test 1: Renders existing channels from NOTIFICATION_CHANNELS_QUERY
  it('renders existing channels from query', async () => {
    renderPanel([channelsMock]);
    expect(await screen.findByText('ops-slack')).toBeInTheDocument();
    // The table row shows the channel type in a <td>; getAllByText handles the dropdown dupe
    expect(screen.getAllByText('SLACK').length).toBeGreaterThanOrEqual(1);
    // scan.completed appears both in the table cell and the checkbox label — use getAllByText
    expect(screen.getAllByText('scan.completed').length).toBeGreaterThanOrEqual(1);
  });

  it('shows enabled status for a channel', async () => {
    renderPanel([channelsMock]);
    await screen.findByText('ops-slack');
    expect(screen.getByText('Enabled')).toBeInTheDocument();
  });

  it('shows empty state when no channels configured', async () => {
    renderPanel([emptyChannelsMock]);
    expect(await screen.findByText(/no notification channels/i)).toBeInTheDocument();
  });

  it('has a Disable button for enabled channels', async () => {
    renderPanel([channelsMock]);
    await screen.findByText('ops-slack');
    expect(
      screen.getByRole('button', { name: `Disable channel ${channelId}` }),
    ).toBeInTheDocument();
  });

  it('has a Delete button for each channel', async () => {
    renderPanel([channelsMock]);
    await screen.findByText('ops-slack');
    expect(screen.getByRole('button', { name: `Delete channel ${channelId}` })).toBeInTheDocument();
  });

  it('has a Send test button for each channel', async () => {
    renderPanel([channelsMock]);
    await screen.findByText('ops-slack');
    expect(screen.getByRole('button', { name: `Test channel ${channelId}` })).toBeInTheDocument();
  });

  // Test 2: Creating a SLACK channel fires the create mutation with exact variables
  it('creates a SLACK channel with correct mutation variables', async () => {
    const webhookUrl = 'https://hooks.slack/x';
    let mutationCalled = false;
    const createMock = {
      request: {
        query: CREATE_NOTIFICATION_CHANNEL_MUTATION,
        variables: {
          input: {
            name: 'ops-slack',
            type: 'SLACK',
            eventFilters: ['scan.completed'],
            config: { webhookUrl },
          },
        },
      },
      result: () => {
        mutationCalled = true;
        return {
          data: {
            createNotificationChannel: {
              id: 'ch-new',
              name: 'ops-slack',
              type: 'SLACK',
              enabled: true,
              eventFilters: ['scan.completed'],
            },
          },
        };
      },
    };
    const refetchMock = {
      request: { query: NOTIFICATION_CHANNELS_QUERY },
      result: {
        data: {
          notificationChannels: [
            {
              id: 'ch-new',
              name: 'ops-slack',
              type: 'SLACK',
              enabled: true,
              eventFilters: ['scan.completed'],
              createdAt: '2026-01-01T10:00:00.000Z',
              updatedAt: '2026-01-01T10:00:00.000Z',
            },
          ],
        },
      },
    };

    renderPanel([emptyChannelsMock, createMock, refetchMock]);
    await screen.findByText(/no notification channels/i);

    const form = screen.getByRole('form', { name: 'create-notification-channel' });
    expect(form).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Name'), 'ops-slack');

    const typeSelect = screen.getByLabelText('Type');
    await userEvent.selectOptions(typeSelect, 'SLACK');

    const filterCheckbox = screen.getByRole('checkbox', { name: 'scan.completed' });
    await userEvent.click(filterCheckbox);

    await userEvent.type(screen.getByLabelText('Webhook URL'), webhookUrl);

    const submitBtn = screen.getByRole('button', { name: /add channel/i });
    expect(submitBtn).not.toBeDisabled();
    await userEvent.click(submitBtn);

    await waitFor(() => expect(mutationCalled).toBe(true));
  });

  it('submit is disabled when name is empty', async () => {
    renderPanel([emptyChannelsMock]);
    await screen.findByText(/no notification channels/i);
    const submitBtn = screen.getByRole('button', { name: /add channel/i });
    expect(submitBtn).toBeDisabled();
  });

  it('submit is disabled when no event filter is checked', async () => {
    renderPanel([emptyChannelsMock]);
    await screen.findByText(/no notification channels/i);
    await userEvent.type(screen.getByLabelText('Name'), 'test-channel');
    const submitBtn = screen.getByRole('button', { name: /add channel/i });
    expect(submitBtn).toBeDisabled();
  });

  // Test 3: Clicking "Send test" fires TEST_NOTIFICATION_CHANNEL_MUTATION with { id }
  it('clicking Send test fires testNotificationChannel mutation', async () => {
    let testMutationCalled = false;
    const testMock = {
      request: {
        query: TEST_NOTIFICATION_CHANNEL_MUTATION,
        variables: { id: channelId },
      },
      result: () => {
        testMutationCalled = true;
        return {
          data: {
            testNotificationChannel: {
              id: 'notif-1',
              deliveryStatus: 'PENDING',
            },
          },
        };
      },
    };

    renderPanel([channelsMock, testMock]);
    await screen.findByText('ops-slack');

    const testBtn = screen.getByRole('button', { name: `Test channel ${channelId}` });
    await userEvent.click(testBtn);

    await waitFor(() => expect(testMutationCalled).toBe(true));
  });

  it('clicking Disable fires updateNotificationChannel mutation', async () => {
    let updateCalled = false;
    const updateMock = {
      request: {
        query: UPDATE_NOTIFICATION_CHANNEL_MUTATION,
        variables: { id: channelId, input: { enabled: false } },
      },
      result: () => {
        updateCalled = true;
        return {
          data: {
            updateNotificationChannel: {
              id: channelId,
              enabled: false,
              eventFilters: ['scan.completed'],
            },
          },
        };
      },
    };
    const refetchMock = {
      request: { query: NOTIFICATION_CHANNELS_QUERY },
      result: { data: { notificationChannels: [] } },
    };

    renderPanel([channelsMock, updateMock, refetchMock]);
    await screen.findByText('ops-slack');

    const disableBtn = screen.getByRole('button', { name: `Disable channel ${channelId}` });
    await userEvent.click(disableBtn);

    await waitFor(() => expect(updateCalled).toBe(true));
  });

  it('clicking Delete fires deleteNotificationChannel mutation', async () => {
    let deleteCalled = false;
    const deleteMock = {
      request: {
        query: DELETE_NOTIFICATION_CHANNEL_MUTATION,
        variables: { id: channelId },
      },
      result: () => {
        deleteCalled = true;
        return { data: { deleteNotificationChannel: true } };
      },
    };
    const refetchMock = {
      request: { query: NOTIFICATION_CHANNELS_QUERY },
      result: { data: { notificationChannels: [] } },
    };

    renderPanel([channelsMock, deleteMock, refetchMock]);
    await screen.findByText('ops-slack');

    const deleteBtn = screen.getByRole('button', { name: `Delete channel ${channelId}` });
    await userEvent.click(deleteBtn);

    await waitFor(() => expect(deleteCalled).toBe(true));
  });

  it('shows EMAIL config field when EMAIL type is selected', async () => {
    renderPanel([emptyChannelsMock]);
    await screen.findByText(/no notification channels/i);
    const typeSelect = screen.getByLabelText('Type');
    await userEvent.selectOptions(typeSelect, 'EMAIL');
    expect(screen.getByLabelText('To (email)')).toBeInTheDocument();
  });

  it('shows Webhook URL for DISCORD type', async () => {
    renderPanel([emptyChannelsMock]);
    await screen.findByText(/no notification channels/i);
    const typeSelect = screen.getByLabelText('Type');
    await userEvent.selectOptions(typeSelect, 'DISCORD');
    expect(screen.getByLabelText('Webhook URL')).toBeInTheDocument();
  });

  it('shows URL and Secret for WEBHOOK type', async () => {
    renderPanel([emptyChannelsMock]);
    await screen.findByText(/no notification channels/i);
    const typeSelect = screen.getByLabelText('Type');
    await userEvent.selectOptions(typeSelect, 'WEBHOOK');
    expect(screen.getByLabelText('URL')).toBeInTheDocument();
    expect(screen.getByLabelText('Secret (optional)')).toBeInTheDocument();
  });
});
