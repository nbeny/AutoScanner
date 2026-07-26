import { describe, expect, it, vi } from 'vitest';
import { MockedProvider } from '@apollo/client/testing';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { RUN_OSINT_SCAN_MUTATION } from '../../../lib/graphql/queries';
import { OsintCommandBar } from '../osint-command-bar';

describe('<OsintCommandBar />', () => {
  it('disables investigate and kill-switch without a scope', () => {
    render(
      <MockedProvider mocks={[]} addTypename={false}>
        <OsintCommandBar engagementId={undefined} pills={[]} />
      </MockedProvider>,
    );
    expect(screen.getByRole('button', { name: 'Investiguer' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /kill/i })).toBeDisabled();
  });

  it('auto-detects EMAIL and launches with the detected seed type', async () => {
    const runMock = {
      request: {
        query: RUN_OSINT_SCAN_MUTATION,
        variables: {
          input: { engagementId: 'eng-1', seed: 'alice@corp.com', seedType: 'EMAIL' },
        },
      },
      result: {
        data: {
          runOsintScan: {
            seed: 'alice@corp.com',
            seedType: 'EMAIL',
            count: 3,
            launches: [{ scannerName: 'holehe', scanId: 's1' }],
          },
        },
      },
    };
    const onLaunched = vi.fn();
    render(
      <MockedProvider mocks={[runMock]} addTypename={false}>
        <OsintCommandBar engagementId="eng-1" pills={[]} onLaunched={onLaunched} />
      </MockedProvider>,
    );
    fireEvent.change(screen.getByLabelText('osint-seed'), {
      target: { value: 'alice@corp.com' },
    });
    expect((screen.getByLabelText('osint-seed-type') as HTMLSelectElement).value).toBe('EMAIL');
    fireEvent.click(screen.getByRole('button', { name: 'Investiguer' }));
    await waitFor(() =>
      expect(onLaunched).toHaveBeenCalledWith({
        count: 3,
        seed: 'alice@corp.com',
        seedType: 'EMAIL',
      }),
    );
  });

  it('honours a manual seed-type override', async () => {
    const runMock = {
      request: {
        query: RUN_OSINT_SCAN_MUTATION,
        variables: {
          input: { engagementId: 'eng-1', seed: 'corp.com', seedType: 'DOMAIN' },
        },
      },
      result: {
        data: {
          runOsintScan: { seed: 'corp.com', seedType: 'DOMAIN', count: 7, launches: [] },
        },
      },
    };
    const onLaunched = vi.fn();
    render(
      <MockedProvider mocks={[runMock]} addTypename={false}>
        <OsintCommandBar engagementId="eng-1" pills={[]} onLaunched={onLaunched} />
      </MockedProvider>,
    );
    fireEvent.change(screen.getByLabelText('osint-seed'), { target: { value: 'corp.com' } });
    fireEvent.change(screen.getByLabelText('osint-seed-type'), { target: { value: 'DOMAIN' } });
    fireEvent.click(screen.getByRole('button', { name: 'Investiguer' }));
    await waitFor(() =>
      expect(onLaunched).toHaveBeenCalledWith({ count: 7, seed: 'corp.com', seedType: 'DOMAIN' }),
    );
  });
});
