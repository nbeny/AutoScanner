import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OsintGraph } from '../osint-graph';

describe('<OsintGraph />', () => {
  it('shows an empty state when there are no nodes', () => {
    render(<OsintGraph graph={{ nodes: [], edges: [] }} />);
    expect(screen.getByText(/Aucune entité OSINT/i)).toBeInTheDocument();
  });

  it('renders a node per graph node', () => {
    render(
      <OsintGraph
        graph={{
          nodes: [
            { id: 'identity:i1', kind: 'identity', label: 'github', sub: 'neo', column: 0 },
            { id: 'email:e1', kind: 'email', label: 'neo@corp.com', sub: 'corp.com', column: 1 },
          ],
          edges: [{ from: 'identity:i1', to: 'email:e1' }],
        }}
      />,
    );
    expect(screen.getByLabelText('osint-graph')).toBeInTheDocument();
    expect(screen.getByText('github')).toBeInTheDocument();
    expect(screen.getByText('neo@corp.com')).toBeInTheDocument();
  });
});
