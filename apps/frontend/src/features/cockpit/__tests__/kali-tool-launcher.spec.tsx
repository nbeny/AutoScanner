import { describe, expect, it, vi } from 'vitest';
import { MockedProvider } from '@apollo/client/testing';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { KALI_TOOLS_QUERY, RUN_KALI_TOOL_MUTATION } from '../../../lib/graphql/queries';
import { KaliToolLauncher } from '../kali-tool-launcher';

const toolsMock = {
  request: { query: KALI_TOOLS_QUERY },
  result: {
    data: {
      kaliTools: [
        {
          binary: 'dnsrecon',
          package: 'dnsrecon',
          displayName: 'dnsrecon',
          description: 'DNS recon',
          categories: ['information-gathering'],
          hasHelp: true,
          optionCount: 5,
        },
        {
          binary: 'apache2ctl',
          package: 'apache2',
          displayName: 'apache2ctl',
          description: 'apache',
          categories: ['web'],
          hasHelp: true,
          optionCount: 1,
        },
      ],
    },
  },
};

const runMock = {
  request: {
    query: RUN_KALI_TOOL_MUTATION,
    variables: {
      input: { engagementId: 'e1', binary: 'dnsrecon', args: ['-d', 'x.com'], jsonOutput: false },
    },
  },
  result: {
    data: {
      runKaliTool: { id: 'run1', binary: 'dnsrecon', args: ['-d', 'x.com'], status: 'QUEUED' },
    },
  },
};

describe('<KaliToolLauncher />', () => {
  it('shows curated tools, hides infra, and launches runKaliTool', async () => {
    const onLaunched = vi.fn();
    render(
      <MockedProvider mocks={[toolsMock, runMock]} addTypename={false}>
        <KaliToolLauncher engagementId="e1" group="RECON" onLaunched={onLaunched} />
      </MockedProvider>,
    );
    await waitFor(() => expect(screen.getByLabelText('kali-pick-dnsrecon')).toBeInTheDocument());
    expect(screen.queryByLabelText('kali-pick-apache2ctl')).not.toBeInTheDocument(); // infra curated out
    fireEvent.click(screen.getByLabelText('kali-pick-dnsrecon'));
    fireEvent.change(screen.getByLabelText('kali-args'), { target: { value: '-d x.com' } });
    fireEvent.click(screen.getByRole('button', { name: /lancer/i }));
    await waitFor(() => expect(onLaunched).toHaveBeenCalledWith('run1'));
  });
});
