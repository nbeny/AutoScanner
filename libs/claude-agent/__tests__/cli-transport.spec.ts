import { EventEmitter } from 'node:events';
import { CliTransport, StubTransport, isQuota } from '../src/transports';
import type { ClaudeAgentConfig } from '../src/claude-agent.config';

const cfg: ClaudeAgentConfig = {
  transport: 'cli',
  cliPath: 'claude',
  model: 'sonnet',
  timeoutMs: 120000,
  concurrency: 4,
};

interface FakeProc extends EventEmitter {
  stdin: { write: jest.Mock; end: jest.Mock };
  stdout: EventEmitter;
  stderr: EventEmitter;
  kill: jest.Mock;
}

function fakeSpawn(stdout: string, code = 0, stderr = '') {
  const capture: { args?: string[]; opts?: { env?: NodeJS.ProcessEnv } } = {};
  const fn = (_cmd: string, args: string[], opts: { env?: NodeJS.ProcessEnv }) => {
    capture.args = args;
    capture.opts = opts;
    const proc = new EventEmitter() as FakeProc;
    proc.stdin = { write: jest.fn(), end: jest.fn() };
    proc.stdout = new EventEmitter();
    proc.stderr = new EventEmitter();
    proc.kill = jest.fn();
    setImmediate(() => {
      proc.stdout.emit('data', Buffer.from(stdout));
      if (stderr) proc.stderr.emit('data', Buffer.from(stderr));
      proc.emit('close', code);
    });
    return proc;
  };
  return { fn, capture };
}

describe('CliTransport', () => {
  it('builds correct argv and parses the JSON envelope result', async () => {
    const envelope = JSON.stringify({ result: '{"done":true}' });
    const { fn, capture } = fakeSpawn(envelope);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const t = new CliTransport(cfg, fn as any);
    const res = await t.complete({ system: 'SYS', prompt: 'hello' });

    expect(capture.args).toEqual([
      '-p',
      '--model',
      'sonnet',
      '--output-format',
      'json',
      '--system-prompt',
      'SYS',
      '--exclude-dynamic-system-prompt-sections',
    ]);
    expect(res.json()).toEqual({ done: true });
  });

  it('scrubs ANTHROPIC_API_KEY from the child env', async () => {
    process.env['ANTHROPIC_API_KEY'] = 'sk-should-be-removed';
    try {
      const { fn, capture } = fakeSpawn(JSON.stringify({ result: '{}' }));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const t = new CliTransport(cfg, fn as any);
      await t.complete({ system: 'SYS', prompt: 'p' });
      expect(capture.opts?.env?.['ANTHROPIC_API_KEY']).toBeUndefined();
    } finally {
      delete process.env['ANTHROPIC_API_KEY'];
    }
  });

  it('returns empty text on non-zero exit code', async () => {
    const { fn } = fakeSpawn('', 1, 'boom');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const t = new CliTransport(cfg, fn as any);
    const res = await t.complete({ system: 'SYS', prompt: 'p' });
    expect(res.text).toBe('');
  });
});

describe('StubTransport', () => {
  it('returns scripted text', async () => {
    const t = new StubTransport(() => '{"ok":true}');
    const res = await t.complete({ system: 'S', prompt: 'P' });
    expect(res.json()).toEqual({ ok: true });
  });
});

describe('isQuota', () => {
  it('detects quota/limit strings', () => {
    expect(isQuota('You have hit your USAGE LIMIT')).toBe(true);
    expect(isQuota('rate limit exceeded')).toBe(true);
    expect(isQuota('quota reached')).toBe(true);
    expect(isQuota('some other error')).toBe(false);
  });
});
