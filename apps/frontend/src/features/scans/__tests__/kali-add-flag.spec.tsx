import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MockedProvider } from '@apollo/client/testing';
import { KALI_TOOL_QUERY } from '../../../lib/graphql/queries';
import { KaliToolDocPanel } from '../kali-tool-doc-panel';

const toolMock = {
  request: { query: KALI_TOOL_QUERY, variables: { binary: 'nmap' } },
  result: {
    data: {
      kaliTool: {
        binary: 'nmap',
        displayName: 'nmap',
        description: 'Network mapper',
        homepage: null,
        helpTextRaw: null,
        parseConfidence: 'low',
        manAvailable: true,
        optionsSource: 'help',
        manTextRaw: null,
        options: [{ flag: '-sC', argHint: null, description: 'default script scan' }],
      },
    },
  },
};

describe('<KaliToolDocPanel /> onAddFlag', () => {
  it('calls onAddFlag with the clicked flag', async () => {
    const onAddFlag = vi.fn();
    render(
      <MockedProvider mocks={[toolMock]} addTypename={false}>
        <KaliToolDocPanel binary="nmap" onAddFlag={onAddFlag} />
      </MockedProvider>,
    );

    const addButton = await screen.findByLabelText('add-flag--sC');
    fireEvent.click(addButton);

    expect(onAddFlag).toHaveBeenCalledWith('-sC');
  });
});
