import { describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import { MainNav } from '../main-nav';

describe('<MainNav />', () => {
  it('renders all top-level section links with their routes', () => {
    render(
      <MemoryRouter>
        <MainNav email="op@example.com" onLogout={() => undefined} />
      </MemoryRouter>,
    );
    const links: Array<[string, string]> = [
      ['Dashboard', '/dashboard'],
      ['Scans', '/scans'],
      ['Vulnérabilités', '/vulnerabilities'],
      ['Outils', '/tools'],
      ['Engagements', '/engagements'],
      ['Settings', '/settings'],
    ];
    for (const [label, href] of links) {
      expect(screen.getByRole('link', { name: label })).toHaveAttribute('href', href);
    }
    expect(screen.getByText('op@example.com')).toBeInTheDocument();
  });
});
