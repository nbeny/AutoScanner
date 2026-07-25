import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Sparkline } from '../sparkline';

describe('<Sparkline />', () => {
  it('renders one bar per value with an accessible label', () => {
    render(<Sparkline values={[1, 4, 2, 8]} aria-label="trend" />);
    const el = screen.getByLabelText('trend');
    expect(el.querySelectorAll('[data-bar]')).toHaveLength(4);
  });

  it('renders nothing but the container when values are empty', () => {
    render(<Sparkline values={[]} aria-label="empty" />);
    expect(screen.getByLabelText('empty').querySelectorAll('[data-bar]')).toHaveLength(0);
  });
});
