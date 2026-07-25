import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Panel } from '../panel';

describe('<Panel />', () => {
  it('renders children and applies the glow shadow when glow is set', () => {
    render(
      <Panel glow aria-label="p">
        hello
      </Panel>,
    );
    const el = screen.getByLabelText('p');
    expect(el).toHaveTextContent('hello');
    expect(el.className).toContain('shadow-glow');
  });

  it('omits the glow shadow by default', () => {
    render(<Panel aria-label="p2">x</Panel>);
    expect(screen.getByLabelText('p2').className).not.toContain('shadow-glow');
  });
});
