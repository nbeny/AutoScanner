import { spawn as nodeSpawn } from 'node:child_process';
import { ClaudeResponse } from './claude-response';
import type { ClaudeAgentConfig } from './claude-agent.config';

export interface CompleteArgs {
  system: string;
  prompt: string;
}

export interface Transport {
  complete(a: CompleteArgs): Promise<ClaudeResponse>;
}

function childEnv(): NodeJS.ProcessEnv {
  const e = { ...process.env };
  delete e['ANTHROPIC_API_KEY'];
  delete e['ANTHROPIC_AUTH_TOKEN'];
  return e;
}

class Semaphore {
  private q: (() => void)[] = [];
  constructor(private n: number) {}
  async acquire(): Promise<void> {
    if (this.n > 0) {
      this.n--;
      return;
    }
    await new Promise<void>((r) => this.q.push(r));
  }
  release(): void {
    const w = this.q.shift();
    if (w) w();
    else this.n++;
  }
}

export class CliTransport implements Transport {
  private sem: Semaphore;

  constructor(
    private cfg: ClaudeAgentConfig,
    private spawnFn: typeof nodeSpawn = nodeSpawn,
  ) {
    this.sem = new Semaphore(cfg.concurrency);
  }

  async complete({ system, prompt }: CompleteArgs): Promise<ClaudeResponse> {
    await this.sem.acquire();
    try {
      return await this.run(system, prompt);
    } finally {
      this.sem.release();
    }
  }

  private run(system: string, prompt: string): Promise<ClaudeResponse> {
    return new Promise((resolve) => {
      const args = [
        '-p',
        '--model',
        this.cfg.model,
        '--output-format',
        'json',
        '--system-prompt',
        system,
        '--exclude-dynamic-system-prompt-sections',
      ];
      const proc = this.spawnFn(this.cfg.cliPath, args, { env: childEnv() });
      let out = '';
      const timer = setTimeout(() => {
        proc.kill('SIGKILL');
        resolve(new ClaudeResponse(''));
      }, this.cfg.timeoutMs);
      proc.stdout?.on('data', (d) => (out += d.toString()));
      proc.on('close', (code) => {
        clearTimeout(timer);
        if (code !== 0) return resolve(new ClaudeResponse(''));
        try {
          const env = JSON.parse(out);
          const u = env.usage ?? {};
          resolve(new ClaudeResponse(env.result ?? '', u.input_tokens ?? 0, u.output_tokens ?? 0));
        } catch {
          resolve(new ClaudeResponse(''));
        }
      });
      proc.stdin?.write(prompt);
      proc.stdin?.end();
    });
  }
}

export class StubTransport implements Transport {
  constructor(private script: (a: CompleteArgs) => string) {}
  async complete(a: CompleteArgs): Promise<ClaudeResponse> {
    return new ClaudeResponse(this.script(a));
  }
}

export function isQuota(stderr: string): boolean {
  const s = stderr.toLowerCase();
  return s.includes('usage limit') || s.includes('rate limit') || s.includes('quota');
}
