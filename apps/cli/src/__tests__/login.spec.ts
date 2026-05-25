import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { runLogin } from '../commands/login';
import { ConfigStore } from '../lib/config-store';

describe('runLogin', () => {
  let dir: string;
  let store: ConfigStore;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'autoscanner-cli-login-'));
    store = new ConfigStore(join(dir, 'config.json'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('persists tokens and apiUrl on successful login', async () => {
    const login = jest.fn().mockResolvedValue({
      accessToken: 'access_xyz',
      refreshToken: 'refresh_xyz',
      user: { id: 'user_1', email: 'op@example.com' },
    });
    const logs: string[] = [];

    await runLogin(
      {
        store,
        buildClient: (url) => {
          expect(url).toBe('http://localhost:3000');
          return { login };
        },
        log: (m) => logs.push(m),
      },
      { apiUrl: 'http://localhost:3000', email: 'op@example.com', password: 'pw' },
    );

    expect(login).toHaveBeenCalledWith('op@example.com', 'pw');
    const saved = JSON.parse(readFileSync(join(dir, 'config.json'), 'utf8'));
    expect(saved).toEqual({
      apiUrl: 'http://localhost:3000',
      accessToken: 'access_xyz',
      refreshToken: 'refresh_xyz',
    });
    expect(logs).toEqual(['logged in as op@example.com -> http://localhost:3000']);
  });

  it('lets errors from the api client bubble (does not persist on failure)', async () => {
    const login = jest.fn().mockRejectedValue(new Error('401'));

    await expect(
      runLogin(
        {
          store,
          buildClient: () => ({ login }),
          log: () => undefined,
        },
        { apiUrl: 'http://x', email: 'op@example.com', password: 'bad' },
      ),
    ).rejects.toThrow('401');

    expect(await store.load()).toEqual({});
  });
});
