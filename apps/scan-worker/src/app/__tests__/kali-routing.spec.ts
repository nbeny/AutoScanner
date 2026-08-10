import { KALI_TOOLBOX_IMAGE } from '@autoscanner/common';
import { KALI_TOOLBOX_ALLOWLIST, isExecFailure, resolveScanImage } from '../kali-routing';

describe('kali-routing', () => {
  it('routes an allowlisted scanner to the toolbox image, with its own image as fallback', () => {
    const r = resolveScanImage('sslscan', 'sslscan-own:1.0');
    expect(r.image).toBe(KALI_TOOLBOX_IMAGE);
    expect(r.fallbackImage).toBe('sslscan-own:1.0');
    expect(r.usesKali).toBe(true);
  });

  it('leaves a non-allowlisted scanner on its own image, no fallback', () => {
    const r = resolveScanImage('naabu', 'naabu-own:1.0');
    expect(r.image).toBe('naabu-own:1.0');
    expect(r.fallbackImage).toBeNull();
    expect(r.usesKali).toBe(false);
  });

  it('never routes the known-collision / template scanners', () => {
    for (const excluded of ['httpx', 'favicon', 'nuclei', 'exposed-config', 'web-dast']) {
      expect(KALI_TOOLBOX_ALLOWLIST.has(excluded)).toBe(false);
    }
  });

  it('treats only 126/127 as an exec failure (not a normal non-zero exit)', () => {
    expect(isExecFailure(126)).toBe(true);
    expect(isExecFailure(127)).toBe(true);
    expect(isExecFailure(0)).toBe(false);
    expect(isExecFailure(1)).toBe(false);
    expect(isExecFailure(-1)).toBe(false);
  });
});
