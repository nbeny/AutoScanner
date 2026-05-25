import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

export interface CliConfig {
  apiUrl?: string;
  accessToken?: string;
  refreshToken?: string;
}

export function defaultConfigPath(): string {
  return join(homedir(), '.autoscanner', 'config.json');
}

export class ConfigStore {
  constructor(private readonly path: string = defaultConfigPath()) {}

  async load(): Promise<CliConfig> {
    if (!existsSync(this.path)) return {};
    const raw = await readFile(this.path, 'utf8');
    return JSON.parse(raw) as CliConfig;
  }

  async save(cfg: CliConfig): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    await writeFile(this.path, JSON.stringify(cfg, null, 2), { mode: 0o600 });
  }
}
