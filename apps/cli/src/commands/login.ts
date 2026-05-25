import { ApiClient } from '../lib/api-client';
import { ConfigStore } from '../lib/config-store';

export interface LoginCommandDeps {
  store: ConfigStore;
  buildClient: (apiUrl: string) => Pick<ApiClient, 'login'>;
  log: (msg: string) => void;
}

export interface LoginOptions {
  apiUrl: string;
  email: string;
  password: string;
}

export async function runLogin(deps: LoginCommandDeps, opts: LoginOptions): Promise<void> {
  const client = deps.buildClient(opts.apiUrl);
  const auth = await client.login(opts.email, opts.password);
  await deps.store.save({
    apiUrl: opts.apiUrl,
    accessToken: auth.accessToken,
    refreshToken: auth.refreshToken,
  });
  deps.log(`logged in as ${auth.user.email} -> ${opts.apiUrl}`);
}
