import { CloudExposure } from '../builtins/cloud-exposure';
import { BUILTIN_TEMPLATES } from '../builtins';

describe('cloud-exposure template', () => {
  it('runs s3scanner then cloudbrute over the target', () => {
    expect(CloudExposure.name).toBe('cloud-exposure');
    expect(CloudExposure.steps.map((s) => s.scannerName)).toEqual(['s3scanner', 'cloudbrute']);
    expect(CloudExposure.steps[0].target).toEqual({ kind: 'context', path: 'target' });
    expect(CloudExposure.steps[1].target).toEqual({ kind: 'context', path: 'target' });
  });

  it('is registered in BUILTIN_TEMPLATES', () => {
    expect(BUILTIN_TEMPLATES.some((t) => t.name === 'cloud-exposure')).toBe(true);
  });
});
