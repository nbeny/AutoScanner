/**
 * Phase 5.2 acceptance: schedule CRUD over GraphQL.
 *
 * Scenario:
 *  1. Login + create a fresh engagement.
 *  2. Read `scanTemplates` to pick a templateId.
 *  3. `createSchedule` with cron every 5 minutes -> assert nextRunAt is set.
 *  4. `schedules(engagementId)` contains the new row.
 *  5. `updateSchedule(enabled:false)` -> assert enabled flips.
 *  6. `deleteSchedule` -> assert it disappears from the list.
 *
 * Opt-in: skips unless E2E_API_URL + E2E_EMAIL + E2E_PASSWORD are set
 * AND `SCHEDULER_E2E=1`.
 *
 * Required env:
 *   E2E_API_URL    e.g. http://localhost:4000
 *   E2E_EMAIL      existing operator email
 *   E2E_PASSWORD   existing operator password
 *   SCHEDULER_E2E=1 explicit opt-in
 */

import type { GraphQLClient } from 'graphql-request';
import {
  authedGqlClient,
  createEngagement,
  describeOrSkipE2E,
  readBaseEnv,
  restLogin,
} from '../helpers';

const env = readBaseEnv();
const schedulerEnabled = process.env['SCHEDULER_E2E'] === '1';
const describeOrSkip = schedulerEnabled ? describeOrSkipE2E(env) : describe.skip;

interface ScheduleRow {
  id: string;
  name: string;
  enabled: boolean;
  nextRunAt: string | null;
}

const SCAN_TEMPLATES_QUERY = /* GraphQL */ `
  query ScanTemplates {
    scanTemplates {
      id
      name
    }
  }
`;

const CREATE_SCHEDULE = /* GraphQL */ `
  mutation CreateSchedule($input: CreateScheduleInput!) {
    createSchedule(input: $input) {
      id
      name
      enabled
      nextRunAt
    }
  }
`;

const SCHEDULES = /* GraphQL */ `
  query Schedules($engagementId: ID!) {
    schedules(engagementId: $engagementId) {
      id
      name
      enabled
      nextRunAt
    }
  }
`;

const UPDATE_SCHEDULE = /* GraphQL */ `
  mutation UpdateSchedule($id: ID!, $input: UpdateScheduleInput!) {
    updateSchedule(id: $id, input: $input) {
      id
      enabled
    }
  }
`;

const DELETE_SCHEDULE = /* GraphQL */ `
  mutation DeleteSchedule($id: ID!) {
    deleteSchedule(id: $id)
  }
`;

describeOrSkip('Scheduler GraphQL e2e', () => {
  let gql: GraphQLClient;

  beforeAll(async () => {
    const auth = await restLogin(env.apiUrl!, env.email!, env.password!);
    gql = authedGqlClient(env.apiUrl!, auth.accessToken);
  });

  it('creates, lists, disables, and deletes a schedule', async () => {
    const engagement = await createEngagement(gql, {
      name: `sched-e2e-${Date.now()}`,
      clientName: 'sched-e2e',
    });

    const { scanTemplates } = await gql.request<{ scanTemplates: { id: string }[] }>(
      SCAN_TEMPLATES_QUERY,
    );
    expect(scanTemplates.length).toBeGreaterThan(0);
    const templateId = scanTemplates[0].id;

    const { createSchedule } = await gql.request<{ createSchedule: ScheduleRow }>(CREATE_SCHEDULE, {
      input: {
        engagementId: engagement.id,
        templateId,
        name: 'e2e nightly',
        cronExpr: '*/5 * * * *',
        timezone: 'UTC',
        targets: ['example.com'],
      },
    });
    expect(createSchedule.nextRunAt).toBeTruthy();
    const scheduleId = createSchedule.id;

    const listed = await gql.request<{ schedules: ScheduleRow[] }>(SCHEDULES, {
      engagementId: engagement.id,
    });
    expect(listed.schedules.map((s) => s.id)).toContain(scheduleId);

    const { updateSchedule } = await gql.request<{ updateSchedule: ScheduleRow }>(UPDATE_SCHEDULE, {
      id: scheduleId,
      input: { enabled: false },
    });
    expect(updateSchedule.enabled).toBe(false);

    const { deleteSchedule } = await gql.request<{ deleteSchedule: boolean }>(DELETE_SCHEDULE, {
      id: scheduleId,
    });
    expect(deleteSchedule).toBe(true);

    const afterDelete = await gql.request<{ schedules: ScheduleRow[] }>(SCHEDULES, {
      engagementId: engagement.id,
    });
    expect(afterDelete.schedules.map((s) => s.id)).not.toContain(scheduleId);
  });
});
