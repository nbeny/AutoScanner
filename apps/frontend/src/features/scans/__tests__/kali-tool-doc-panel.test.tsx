import { describe, expect, it } from 'vitest';
import { MockedProvider } from '@apollo/client/testing';
import { render, screen, waitFor } from '@testing-library/react';
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
        homepage: 'https://nmap.org',
        helpTextRaw: 'Usage: nmap [options]',
        parseConfidence: 'low',
        manAvailable: true,
        optionsSource: 'help',
        manTextRaw: null,
        options: [{ flag: '-sV', argHint: null, description: 'version detect' }],
      },
    },
  },
};

describe('<KaliToolDocPanel />', () => {
  it('renders the Kali doc (description, homepage, help, options)', async () => {
    render(
      <MockedProvider mocks={[toolMock]} addTypename={false}>
        <KaliToolDocPanel binary="nmap" />
      </MockedProvider>,
    );
    expect(await screen.findByText('Network mapper')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /homepage/i })).toHaveAttribute(
      'href',
      'https://nmap.org',
    );
    expect(screen.getByText('-sV')).toBeInTheDocument();
    expect(screen.getByText(/Usage: nmap/)).toBeInTheDocument();
  });

  it('renders nothing when the tool is unknown', async () => {
    const nullMock = {
      request: { query: KALI_TOOL_QUERY, variables: { binary: 'ghost' } },
      result: { data: { kaliTool: null } },
    };
    const { container } = render(
      <MockedProvider mocks={[nullMock]} addTypename={false}>
        <KaliToolDocPanel binary="ghost" />
      </MockedProvider>,
    );
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });
});
