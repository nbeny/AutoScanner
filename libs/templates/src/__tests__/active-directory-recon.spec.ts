import { ActiveDirectoryRecon } from '../builtins/active-directory-recon';
import { BUILTIN_TEMPLATES } from '../builtins';

describe('active-directory-recon template', () => {
  it('runs kerbrute then ldap-enum over the target', () => {
    expect(ActiveDirectoryRecon.name).toBe('active-directory-recon');
    expect(ActiveDirectoryRecon.steps.map((s) => s.scannerName)).toEqual(['kerbrute', 'ldap-enum']);
    expect(ActiveDirectoryRecon.steps[0].target).toEqual({ kind: 'context', path: 'target' });
    expect(ActiveDirectoryRecon.steps[1].target).toEqual({ kind: 'context', path: 'target' });
  });

  it('is registered in BUILTIN_TEMPLATES', () => {
    expect(BUILTIN_TEMPLATES.some((t) => t.name === 'active-directory-recon')).toBe(true);
  });
});
