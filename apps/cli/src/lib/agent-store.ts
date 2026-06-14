import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

export interface AgentState {
  apiUrl: string;
  agentId: string;
  privateKeyBase64: string;
}

export function defaultAgentStatePath(): string {
  return join(homedir(), '.autoscanner', 'agent.json');
}

export class AgentStore {
  constructor(private readonly path: string = defaultAgentStatePath()) {}

  async load(): Promise<AgentState | null> {
    if (!existsSync(this.path)) return null;
    const raw = await readFile(this.path, 'utf8');
    return JSON.parse(raw) as AgentState;
  }

  async save(state: AgentState): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    await writeFile(this.path, JSON.stringify(state, null, 2), { mode: 0o600 });
  }
}
