import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusDot } from '../status-dot';

describe('<StatusDot />', () => {
  it('labels the dot with its status and colors RUNNING cyan', () => {
    render(<StatusDot status="RUNNING" />);
    const dot = screen.getByLabelText('RUNNING');
    expect(dot.className).toContain('bg-neon-cyan');
  });
});
