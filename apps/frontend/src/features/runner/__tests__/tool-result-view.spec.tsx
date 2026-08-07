// apps/frontend/src/features/runner/__tests__/tool-result-view.spec.tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ToolResultView } from '../tool-result-view';

describe('<ToolResultView />', () => {
  it('renders a json format as pretty text (not a one-line blob)', () => {
    render(<ToolResultView parsed={{ format: 'json', view: { host: 'up', ports: [22, 80] } }} />);
    const pre = screen.getByLabelText('tool-result-json');
    expect(pre.textContent).toContain('"host": "up"');
    expect(pre.textContent).toContain('\n'); // indented, multi-line
  });
  it('renders a table', () => {
    render(
      <ToolResultView
        parsed={{ format: 'table', view: { headers: ['PORT', 'STATE'], rows: [['22', 'open']] } }}
      />,
    );
    expect(screen.getByRole('columnheader', { name: 'PORT' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: '22' })).toBeInTheDocument();
  });
  it('renders key/value pairs', () => {
    render(
      <ToolResultView
        parsed={{ format: 'keyvalue', view: { pairs: [{ key: 'Host', value: 'up' }] } }}
      />,
    );
    expect(screen.getByText('Host')).toBeInTheDocument();
    expect(screen.getByText('up')).toBeInTheDocument();
  });
  it('renders plain text lines', () => {
    render(
      <ToolResultView parsed={{ format: 'text', view: { lines: ['line one', 'line two'] } }} />,
    );
    expect(screen.getByLabelText('tool-result-text').textContent).toContain('line one');
  });
  it('shows a placeholder when there is no parsed output', () => {
    render(<ToolResultView parsed={null} />);
    expect(screen.getByText(/no output/i)).toBeInTheDocument();
  });
});
