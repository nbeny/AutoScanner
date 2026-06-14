/**
 * Phase 5.3 acceptance: notification channel CRUD + test-channel over GraphQL.
 *
 * Scenario:
 *  1. Login + authedGqlClient.
 *  2. createNotificationChannel (WEBHOOK) → assert id + enabled.
 *  3. notificationChannels query → assert the new channel is listed (no config field).
 *  4. testNotificationChannel(id) → assert returns a Notification with id + deliveryStatus.
 *  5. channelDeliveries(channelId) → assert at least one row exists (the test notification).
 *  6. deleteNotificationChannel(id) → assert true, then notificationChannels no longer lists it.
 *
 * The notification-worker does NOT need to be running for assertions to pass —
 * delivery status may remain PENDING without it; the spec only checks structure.
 *
 * Opt-in: skips unless E2E_API_URL + E2E_EMAIL + E2E_PASSWORD are set
 * AND `NOTIFICATIONS_E2E=1`.
 *
 * Required env:
 *   E2E_API_URL        e.g. http://localhost:4000
 *   E2E_EMAIL          existing operator email
 *   E2E_PASSWORD       existing operator password
 *   NOTIFICATIONS_E2E=1  explicit opt-in
 */

import type { GraphQLClient } from 'graphql-request';
import { authedGqlClient, describeOrSkipE2E, readBaseEnv, restLogin } from '../helpers';

const env = readBaseEnv();
const notificationsEnabled = process.env['NOTIFICATIONS_E2E'] === '1';
const describeOrSkip = notificationsEnabled ? describeOrSkipE2E(env) : describe.skip;

interface NotificationChannelRow {
  id: string;
  name: string;
  type: string;
  enabled: boolean;
  eventFilters: string[];
}

interface NotificationRow {
  id: string;
  channelId: string;
  eventType: string;
  deliveryStatus: string;
}

const CREATE_NOTIFICATION_CHANNEL = /* GraphQL */ `
  mutation CreateNotificationChannel($input: CreateNotificationChannelInput!) {
    createNotificationChannel(input: $input) {
      id
      name
      type
      enabled
      eventFilters
    }
  }
`;

const NOTIFICATION_CHANNELS = /* GraphQL */ `
  query NotificationChannels {
    notificationChannels {
      id
      name
      type
      enabled
      eventFilters
    }
  }
`;

const TEST_NOTIFICATION_CHANNEL = /* GraphQL */ `
  mutation TestNotificationChannel($id: ID!) {
    testNotificationChannel(id: $id) {
      id
      channelId
      eventType
      deliveryStatus
    }
  }
`;

const CHANNEL_DELIVERIES = /* GraphQL */ `
  query ChannelDeliveries($channelId: ID!) {
    channelDeliveries(channelId: $channelId) {
      id
      channelId
      eventType
      deliveryStatus
    }
  }
`;

const DELETE_NOTIFICATION_CHANNEL = /* GraphQL */ `
  mutation DeleteNotificationChannel($id: ID!) {
    deleteNotificationChannel(id: $id)
  }
`;

describeOrSkip('Phase 5.3 — notifications e2e', () => {
  let gql: GraphQLClient;

  beforeAll(async () => {
    const auth = await restLogin(env.apiUrl!, env.email!, env.password!);
    gql = authedGqlClient(env.apiUrl!, auth.accessToken);
  });

  it('creates, lists, tests, and deletes a WEBHOOK notification channel', async () => {
    // Step 2: create a WEBHOOK channel
    const { createNotificationChannel } = await gql.request<{
      createNotificationChannel: NotificationChannelRow;
    }>(CREATE_NOTIFICATION_CHANNEL, {
      input: {
        name: `e2e-webhook-${Date.now()}`,
        type: 'WEBHOOK',
        eventFilters: ['scan.completed'],
        config: { url: 'https://example.invalid/hook' },
      },
    });

    expect(createNotificationChannel.id).toBeTruthy();
    expect(createNotificationChannel.enabled).toBe(true);
    expect(createNotificationChannel.type).toBe('WEBHOOK');
    expect(createNotificationChannel.eventFilters).toContain('scan.completed');

    const channelId = createNotificationChannel.id;

    // Step 3: list channels — channel is present; no `config` field in the response (not in schema)
    const { notificationChannels } = await gql.request<{
      notificationChannels: NotificationChannelRow[];
    }>(NOTIFICATION_CHANNELS);

    const listed = notificationChannels.find((ch) => ch.id === channelId);
    expect(listed).toBeDefined();
    expect(listed!.id).toBe(channelId);
    // Assert config is not present on the returned object (not in the GraphQL schema)
    expect((listed as unknown as Record<string, unknown>)['config']).toBeUndefined();

    // Step 4: testNotificationChannel → returns a Notification with id + deliveryStatus
    const { testNotificationChannel } = await gql.request<{
      testNotificationChannel: NotificationRow;
    }>(TEST_NOTIFICATION_CHANNEL, { id: channelId });

    expect(testNotificationChannel.id).toBeTruthy();
    expect(testNotificationChannel.channelId).toBe(channelId);
    expect(['PENDING', 'SENT', 'FAILED']).toContain(testNotificationChannel.deliveryStatus);

    // Step 5: channelDeliveries → at least one row (the test notification)
    const { channelDeliveries } = await gql.request<{
      channelDeliveries: NotificationRow[];
    }>(CHANNEL_DELIVERIES, { channelId });

    expect(channelDeliveries.length).toBeGreaterThanOrEqual(1);
    expect(channelDeliveries.some((n) => n.id === testNotificationChannel.id)).toBe(true);

    // Step 6: delete and confirm removal
    const { deleteNotificationChannel } = await gql.request<{
      deleteNotificationChannel: boolean;
    }>(DELETE_NOTIFICATION_CHANNEL, { id: channelId });

    expect(deleteNotificationChannel).toBe(true);

    const afterDelete = await gql.request<{ notificationChannels: NotificationChannelRow[] }>(
      NOTIFICATION_CHANNELS,
    );
    expect(afterDelete.notificationChannels.map((ch) => ch.id)).not.toContain(channelId);
  });
});
