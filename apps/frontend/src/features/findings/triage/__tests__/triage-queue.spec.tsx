import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TriageQueue, type QueueItem } from '../triage-queue';

const items: QueueItem[] = [
  {
    id: 'cf_1',
    title: 'RCE Apache Struts',
    severity: 'CRITICAL',
    status: 'OPEN',
    riskScore: 9.8,
    assetId: 'a1',
    sources: ['nuclei'],
  },
  {
    id: 'cf_2',
    title: 'Weak TLS',
    severity: 'HIGH',
    status: 'TRIAGED',
    riskScore: 5,
    assetId: 'a2',
    sources: ['sslscan'],
  },
];

describe('<TriageQueue />', () => {
  it('renders one row per item with title and risk score', () => {
    render(<TriageQueue items={items} selectedId="cf_1" onSelect={vi.fn()} />);
    expect(screen.getByText('RCE Apache Struts')).toBeInTheDocument();
    expect(screen.getByText('Weak TLS')).toBeInTheDocument();
    expect(screen.getByText('9.8')).toBeInTheDocument();
  });

  it('marks the selected row with aria-current', () => {
    render(<TriageQueue items={items} selectedId="cf_1" onSelect={vi.fn()} />);
    const selected = screen.getByRole('button', { name: /RCE Apache Struts/ });
    expect(selected).toHaveAttribute('aria-current', 'true');
  });

  it('calls onSelect when a row is clicked', () => {
    const onSelect = vi.fn();
    render(<TriageQueue items={items} selectedId="cf_1" onSelect={onSelect} />);
    screen.getByRole('button', { name: /Weak TLS/ }).click();
    expect(onSelect).toHaveBeenCalledWith('cf_2');
  });

  it('renders a footer counter of statuses', () => {
    render(<TriageQueue items={items} selectedId="cf_1" onSelect={vi.fn()} />);
    expect(screen.getByText(/1 open/i)).toBeInTheDocument();
    expect(screen.getByText(/1 triaged/i)).toBeInTheDocument();
  });
});
