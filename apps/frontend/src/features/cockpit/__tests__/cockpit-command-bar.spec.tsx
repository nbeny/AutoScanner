import { describe, expect, it, vi } from 'vitest';
import { MockedProvider } from '@apollo/client/testing';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { RUN_SCAN_MUTATION } from '../../../lib/graphql/queries';
import { CockpitCommandBar } from '../cockpit-command-bar';

describe('<CockpitCommandBar />', () => {
  it('disables launch and kill-switch without a scope', () => {
    render(
      <MockedProvider mocks={[]} addTypename={false}>
        <CockpitCommandBar engagementId={undefined} pills={[]} />
      </MockedProvider>,
    );
    expect(screen.getByRole('button', { name: 'Run' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /kill/i })).toBeDisabled();
  });

  it('launches a scan with the scoped engagement', async () => {
    const runMock = {
      request: {
        query: RUN_SCAN_MUTATION,
        variables: {
          input: {
            engagementId: 'eng-1',
            scannerName: 'nmap',
            target: '10.0.0.1',
            optionsJson: '',
          },
        },
      },
      result: { data: { runScan: { id: 'scan-9', status: 'QUEUED', jobs: [] } } },
    };
    const onLaunched = vi.fn();
    render(
      <MockedProvider mocks={[runMock]} addTypename={false}>
        <CockpitCommandBar engagementId="eng-1" pills={[]} onLaunched={onLaunched} />
      </MockedProvider>,
    );
    fireEvent.change(screen.getByLabelText('quick-target'), { target: { value: '10.0.0.1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    await waitFor(() => expect(onLaunched).toHaveBeenCalled());
  });
});
