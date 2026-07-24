import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { AiRunNode } from '../types';
import { ScanGraph } from '../scan-graph';

function node(partial: Partial<AiRunNode> & { id: string; scannerName: string }): AiRunNode {
  return {
    parentNodeId: null,
    scanId: null,
    target: '1.2.3.4',
    depth: 0,
    rationale: null,
    status: 'COMPLETED',
    createdAt: new Date().toISOString(),
    ...partial,
  };
}

describe('<ScanGraph />', () => {
  it('renders one label per node', () => {
    const nodes: AiRunNode[] = [
      node({ id: 'n1', scannerName: 'nmap', depth: 0 }),
      node({ id: 'n2', scannerName: 'httpx', depth: 1, parentNodeId: 'n1' }),
      node({ id: 'n3', scannerName: 'nuclei', depth: 2, parentNodeId: 'n2' }),
    ];
    render(<ScanGraph nodes={nodes} selectedId={null} onSelect={() => {}} />);
    expect(screen.getByText('nmap')).toBeInTheDocument();
    expect(screen.getByText('httpx')).toBeInTheDocument();
    expect(screen.getByText('nuclei')).toBeInTheDocument();
  });

  it('does not throw when a parentNodeId references a missing node', () => {
    const nodes: AiRunNode[] = [
      node({ id: 'n2', scannerName: 'httpx', depth: 1, parentNodeId: 'does-not-exist' }),
    ];
    expect(() =>
      render(<ScanGraph nodes={nodes} selectedId={null} onSelect={() => {}} />),
    ).not.toThrow();
    expect(screen.getByText('httpx')).toBeInTheDocument();
  });

  it('renders a placeholder for empty nodes', () => {
    render(<ScanGraph nodes={[]} selectedId={null} onSelect={() => {}} />);
    expect(screen.getByText(/no scanners launched yet/i)).toBeInTheDocument();
  });

  it('calls onSelect when a node is clicked', () => {
    const onSelect = vi.fn();
    render(
      <ScanGraph
        nodes={[node({ id: 'n1', scannerName: 'nmap' })]}
        selectedId={null}
        onSelect={onSelect}
      />,
    );
    screen
      .getByText('nmap')
      .closest('g')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onSelect).toHaveBeenCalledWith('n1');
  });
});
