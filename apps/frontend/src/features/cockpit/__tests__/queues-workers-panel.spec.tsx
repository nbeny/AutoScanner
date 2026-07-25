import { describe, expect, it } from 'vitest';
import { MockedProvider } from '@apollo/client/testing';
import { render, screen, waitFor } from '@testing-library/react';
import { QUEUE_HEALTH_QUERY } from '../../../lib/graphql/queries';
import { QueuesWorkersPanel } from '../queues-workers-panel';

const mocks = [
  {
    request: { query: QUEUE_HEALTH_QUERY },
    result: {
      data: {
        queueHealth: [
          {
            name: 'scan-jobs',
            waiting: 2,
            active: 1,
            completed: 9,
            failed: 0,
            delayed: 0,
            workers: 3,
          },
          {
            name: 'parse-jobs',
            waiting: 0,
            active: 0,
            completed: 4,
            failed: 1,
            delayed: 0,
            workers: 2,
          },
        ],
      },
    },
  },
];

describe('<QueuesWorkersPanel />', () => {
  it('renders a row per queue with waiting/active/workers', async () => {
    render(
      <MockedProvider mocks={mocks} addTypename={false}>
        <QueuesWorkersPanel />
      </MockedProvider>,
    );
    await waitFor(() => expect(screen.getByText('scan-jobs')).toBeInTheDocument());
    expect(screen.getByText('parse-jobs')).toBeInTheDocument();
    const row = screen.getByLabelText('queue-row-scan-jobs');
    expect(row).toHaveTextContent('1');
    expect(row).toHaveTextContent('3');
  });
});
