import { describe, expect, it, vi } from 'vitest';
import { MockedProvider } from '@apollo/client/testing';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { KALI_TOOL_QUERY } from '../../../lib/graphql/queries';
import { ManOptionPalette } from '../man-option-palette';

const kaliMock = {
  request: { query: KALI_TOOL_QUERY, variables: { binary: 'nmap' } },
  result: {
    data: {
      kaliTool: {
        binary: 'nmap',
        displayName: 'nmap',
        description: 'Network mapper',
        homepage: null,
        helpTextRaw: null,
        optionsSource: 'man',
        manTextRaw: null,
        options: [
          { flag: '-sV', argHint: null, description: 'Probe open ports for service/version' },
          { flag: '-p', argHint: '<ports>', description: 'Only scan specified ports' },
        ],
      },
    },
  },
};

describe('<ManOptionPalette />', () => {
  it('renders clickable option chips and calls onAddFlag on click', async () => {
    const onAddFlag = vi.fn();
    render(
      <MockedProvider mocks={[kaliMock]} addTypename={false}>
        <ManOptionPalette binary="nmap" onAddFlag={onAddFlag} />
      </MockedProvider>,
    );
    await waitFor(() => expect(screen.getByLabelText('man-option--sV')).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText('man-option--sV'));
    expect(onAddFlag).toHaveBeenCalledWith('-sV');
  });

  it('renders nothing when binary is null', () => {
    const { container } = render(
      <MockedProvider mocks={[]} addTypename={false}>
        <ManOptionPalette binary={null} onAddFlag={() => undefined} />
      </MockedProvider>,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
