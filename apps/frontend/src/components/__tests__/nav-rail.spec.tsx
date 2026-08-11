import { describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import { NavRail } from '../nav-rail';

describe('<NavRail />', () => {
  it('renders the primary destinations with their routes', () => {
    render(
      <MemoryRouter>
        <NavRail />
      </MemoryRouter>,
    );
    const links: Array<[string, string]> = [
      ['Recon', '/'],
      ['Outils', '/tools'],
      ['AutoHunt', '/hunt'],
      ['Settings', '/settings'],
    ];
    for (const [label, href] of links) {
      expect(screen.getByRole('link', { name: label })).toHaveAttribute('href', href);
    }
  });
});
