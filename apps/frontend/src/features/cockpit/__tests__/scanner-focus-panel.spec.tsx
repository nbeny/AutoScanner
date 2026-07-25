import { describe, expect, it } from 'vitest';
import { MockedProvider } from '@apollo/client/testing';
import { render, screen } from '@testing-library/react';
import { ScannerFocusPanel } from '../scanner-focus-panel';

describe('<ScannerFocusPanel />', () => {
  it('prompts when no scanner is focused', () => {
    render(
      <MockedProvider mocks={[]} addTypename={false}>
        <ScannerFocusPanel focus={null} />
      </MockedProvider>,
    );
    expect(screen.getByLabelText('focus-empty')).toBeInTheDocument();
  });

  it('renders the focused scanner header and log pane', () => {
    render(
      <MockedProvider mocks={[]} addTypename={false}>
        <ScannerFocusPanel
          focus={{ scanId: 'scan-1', jobId: 'job-1', scannerName: 'nmap', target: '10.0.0.1' }}
        />
      </MockedProvider>,
    );
    expect(screen.getByText('nmap')).toBeInTheDocument();
    expect(screen.getByText('10.0.0.1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });
});
