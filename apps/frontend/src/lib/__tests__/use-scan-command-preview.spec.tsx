import { describe, expect, it } from 'vitest';
import { MockedProvider } from '@apollo/client/testing';
import { render, screen, waitFor } from '@testing-library/react';
import { PREVIEW_SCAN_COMMAND_QUERY } from '../graphql/queries';
import { useScanCommandPreview } from '../../features/scans/use-scan-command-preview';

function mock(scannerName: string, target: string, optionsJson: string, argv: string[]) {
  return {
    request: { query: PREVIEW_SCAN_COMMAND_QUERY, variables: { scannerName, target, optionsJson } },
    result: { data: { previewScanCommand: { image: 'nmap:latest', argv, note: null } } },
  };
}

function Probe({ target }: { target: string }) {
  const { image, argv, loading } = useScanCommandPreview('nmap', target, '{"ports":"80"}', 0);
  return <div data-testid="p">{loading ? 'loading' : `${image} ${argv.join(' ')}`}</div>;
}

describe('useScanCommandPreview', () => {
  it('returns the previewed image + argv', async () => {
    render(
      <MockedProvider
        mocks={[mock('nmap', 'scanme.example.com', '{"ports":"80"}', ['nmap', '-p', '80'])]}
        addTypename={false}
      >
        <Probe target="scanme.example.com" />
      </MockedProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('p').textContent).toBe('nmap:latest nmap -p 80'));
  });

  it('skips the query when target is empty', () => {
    render(
      <MockedProvider mocks={[]} addTypename={false}>
        <Probe target="" />
      </MockedProvider>,
    );
    // No mock is needed because the query is skipped; nothing throws.
    expect(screen.getByTestId('p').textContent).toBe(' ');
  });
});
