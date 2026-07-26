import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { InvestigationChips } from '../investigation-chips';

const investigations = [
  { seed: 'corp.com', seedType: 'DOMAIN' as const },
  { seed: 'alice@corp.com', seedType: 'EMAIL' as const },
];

describe('<InvestigationChips />', () => {
  it('renders nothing without investigations', () => {
    const { container } = render(
      <InvestigationChips investigations={[]} focus={null} onFocus={() => undefined} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders a "Toutes" chip plus one per investigation and reports focus', () => {
    const onFocus = vi.fn();
    render(<InvestigationChips investigations={investigations} focus={null} onFocus={onFocus} />);
    expect(screen.getByRole('button', { name: 'Toutes' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Domaine · corp.com' }));
    expect(onFocus).toHaveBeenCalledWith({ seed: 'corp.com', seedType: 'DOMAIN' });
  });
});
