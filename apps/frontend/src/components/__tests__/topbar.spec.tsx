import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Topbar } from '../topbar';

describe('<Topbar />', () => {
  it('renders the brand, email, active périmètre, and fires logout', () => {
    const onLogout = vi.fn();
    render(<Topbar email="op@example.com" onLogout={onLogout} engagementName="Quick Scans" />);
    expect(screen.getByText('AutoScanner')).toBeInTheDocument();
    expect(screen.getByText('op@example.com')).toBeInTheDocument();
    expect(screen.getByLabelText('active-scope')).toHaveTextContent('Quick Scans');
    fireEvent.click(screen.getByRole('button', { name: 'Logout' }));
    expect(onLogout).toHaveBeenCalledTimes(1);
  });

  it('omits the périmètre label when no engagement is resolved yet', () => {
    render(<Topbar email="op@example.com" onLogout={() => undefined} />);
    expect(screen.queryByLabelText('active-scope')).not.toBeInTheDocument();
  });
});
