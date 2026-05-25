import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ConfigStore } from '../lib/config-store';

describe('ConfigStore', () => {
  let dir: string;
  let store: ConfigStore;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'autoscanner-cli-'));
    store = new ConfigStore(join(dir, 'config.json'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('load() returns an empty config when no file exists', async () => {
    expect(await store.load()).toEqual({});
  });

  it('save() then load() round-trips the config', async () => {
    await store.save({
      apiUrl: 'http://localhost:3000',
      accessToken: 't_access',
      refreshToken: 't_refresh',
    });
    expect(await store.load()).toEqual({
      apiUrl: 'http://localhost:3000',
      accessToken: 't_access',
      refreshToken: 't_refresh',
    });
  });

  it('save() creates the parent directory if missing', async () => {
    const nested = new ConfigStore(join(dir, 'deep', 'nested', 'config.json'));
    await nested.save({ apiUrl: 'http://x' });
    expect(await nested.load()).toEqual({ apiUrl: 'http://x' });
  });

  it('writes the file with mode 0600 (owner read/write only) on POSIX', async () => {
    if (process.platform === 'win32') {
      return; // Windows ignores POSIX file modes
    }
    await store.save({ apiUrl: 'http://x', accessToken: 'secret' });
    const { statSync } = await import('node:fs');
    const stat = statSync(join(dir, 'config.json'));
    expect(stat.mode & 0o777).toBe(0o600);
  });
});
