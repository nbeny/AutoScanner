import { describe, expect, it } from 'vitest';
import { MockedProvider } from '@apollo/client/testing';
import { MemoryRouter } from 'react-router-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import {
  CREATE_SCHEDULE_MUTATION,
  DELETE_SCHEDULE_MUTATION,
  SCAN_TEMPLATES_QUERY,
  SCHEDULES_QUERY,
  UPDATE_SCHEDULE_MUTATION,
} from '../../../lib/graphql/queries';
import { SchedulesTab } from '../schedules-tab';

const ENGAGEMENT_ID = 'eng_1';

const templatesMock = {
  request: { query: SCAN_TEMPLATES_QUERY },
  result: {
    data: {
      scanTemplates: [
        { id: 'tpl_1', name: 'recon-passive', displayName: 'Passive Recon', description: null },
      ],
    },
  },
};

function scheduleRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'sch_1',
    name: 'nightly recon',
    cronExpr: '0 2 * * *',
    timezone: 'UTC',
    targets: ['example.com'],
    enabled: true,
    nextRunAt: '2026-06-15T02:00:00.000Z',
    lastRunAt: null,
    templateId: 'tpl_1',
    template: { id: 'tpl_1', name: 'recon-passive', displayName: 'Passive Recon' },
    ...overrides,
  };
}

const schedulesMock = {
  request: { query: SCHEDULES_QUERY, variables: { engagementId: ENGAGEMENT_ID } },
  result: { data: { schedules: [scheduleRow()] } },
};

function renderTab(mocks: Parameters<typeof MockedProvider>[0]['mocks']) {
  return render(
    <MemoryRouter>
      <MockedProvider mocks={mocks}>
        <SchedulesTab engagementId={ENGAGEMENT_ID} />
      </MockedProvider>
    </MemoryRouter>,
  );
}

describe('<SchedulesTab />', () => {
  it('renders existing schedules', async () => {
    renderTab([templatesMock, schedulesMock]);
    expect(await screen.findByText('nightly recon')).toBeInTheDocument();
    expect(screen.getByText('0 2 * * *')).toBeInTheDocument();
    expect(screen.getAllByText('Passive Recon').length).toBeGreaterThanOrEqual(1);
  });

  it('creates a schedule and refetches the list', async () => {
    const createMock = {
      request: {
        query: CREATE_SCHEDULE_MUTATION,
        variables: {
          input: {
            engagementId: ENGAGEMENT_ID,
            templateId: 'tpl_1',
            name: 'daily',
            cronExpr: '0 6 * * *',
            timezone: 'UTC',
            targets: ['example.com'],
          },
        },
      },
      result: {
        data: {
          createSchedule: {
            id: 'sch_2',
            name: 'daily',
            cronExpr: '0 6 * * *',
            timezone: 'UTC',
            targets: ['example.com'],
            enabled: true,
            nextRunAt: '2026-06-15T06:00:00.000Z',
            templateId: 'tpl_1',
            template: { id: 'tpl_1', displayName: 'Passive Recon' },
          },
        },
      },
    };
    const refetchedMock = {
      request: { query: SCHEDULES_QUERY, variables: { engagementId: ENGAGEMENT_ID } },
      result: {
        data: { schedules: [scheduleRow({ id: 'sch_2', name: 'daily', cronExpr: '0 6 * * *' })] },
      },
    };

    renderTab([templatesMock, schedulesMock, createMock, refetchedMock]);

    await screen.findByText('nightly recon');
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'daily' } });
    fireEvent.change(screen.getByLabelText('Cron'), { target: { value: '0 6 * * *' } });
    fireEvent.change(screen.getByLabelText('Targets'), { target: { value: 'example.com' } });
    fireEvent.submit(screen.getByRole('form', { name: 'create-schedule' }));

    await waitFor(() => expect(screen.getByText('daily')).toBeInTheDocument());
  });

  it('disables a schedule via the toggle button', async () => {
    const updateMock = {
      request: {
        query: UPDATE_SCHEDULE_MUTATION,
        variables: { id: 'sch_1', input: { enabled: false } },
      },
      result: {
        data: {
          updateSchedule: {
            id: 'sch_1',
            enabled: false,
            cronExpr: '0 2 * * *',
            timezone: 'UTC',
            nextRunAt: '2026-06-15T02:00:00.000Z',
          },
        },
      },
    };
    const refetchedMock = {
      request: { query: SCHEDULES_QUERY, variables: { engagementId: ENGAGEMENT_ID } },
      result: { data: { schedules: [scheduleRow({ enabled: false })] } },
    };

    renderTab([templatesMock, schedulesMock, updateMock, refetchedMock]);

    await screen.findByText('nightly recon');
    fireEvent.click(screen.getByRole('button', { name: 'Disable schedule sch_1' }));

    await waitFor(() => expect(screen.getByText('Disabled')).toBeInTheDocument());
  });

  it('exposes a delete control wired to the delete mutation', async () => {
    const deleteMock = {
      request: { query: DELETE_SCHEDULE_MUTATION, variables: { id: 'sch_1' } },
      result: { data: { deleteSchedule: true } },
    };
    const refetchedMock = {
      request: { query: SCHEDULES_QUERY, variables: { engagementId: ENGAGEMENT_ID } },
      result: { data: { schedules: [] } },
    };

    renderTab([templatesMock, schedulesMock, deleteMock, refetchedMock]);

    await screen.findByText('nightly recon');
    fireEvent.click(screen.getByRole('button', { name: 'Delete schedule sch_1' }));

    await waitFor(() => expect(screen.getByText('No schedules yet.')).toBeInTheDocument());
  });
});
