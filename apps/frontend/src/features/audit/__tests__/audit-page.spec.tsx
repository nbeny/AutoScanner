import { describe, expect, it } from 'vitest';
import { MockedProvider } from '@apollo/client/testing';
import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import { ScopeProvider, type ScopeStorage } from '../../../lib/scope-context';
import { AuditPage } from '../audit-page';

function scope(initial: string | null): ScopeStorage {
  let v = initial;
  return {
    read: () => v,
    write: (id) => {
      v = id;
    },
    clear: () => {
      v = null;
    },
  };
}

describe('<AuditPage />', () => {
  it('renders the audit header, posture summary, findings, and reports section (global scope)', () => {
    render(
      <MockedProvider mocks={[]} addTypename={false}>
        <ScopeProvider storage={scope(null)}>
          <MemoryRouter>
            <AuditPage />
          </MemoryRouter>
        </ScopeProvider>
      </MockedProvider>,
    );
    expect(screen.getByLabelText('audit-page')).toBeInTheDocument();
    expect(screen.getByLabelText('posture-summary')).toBeInTheDocument();
    expect(screen.getByLabelText('audit-osint')).toBeInTheDocument();
    expect(screen.getByLabelText('audit-findings')).toBeInTheDocument();
    expect(screen.getByLabelText('audit-reports')).toBeInTheDocument();
    expect(screen.queryByLabelText('report-generate')).not.toBeInTheDocument();
  });
});
