import { loadClaudeAgentConfig } from '../src/claude-agent.config';

describe('loadClaudeAgentConfig', () => {
  it('applies defaults when env is empty', () => {
    const cfg = loadClaudeAgentConfig({});
    expect(cfg.transport).toBe('cli');
    expect(cfg.cliPath).toBe('claude');
    expect(cfg.model).toBe('sonnet');
    expect(cfg.timeoutMs).toBe(120000);
    expect(cfg.concurrency).toBe(4);
  });

  it('honours ANTHROPIC_TRANSPORT override', () => {
    const cfg = loadClaudeAgentConfig({ ANTHROPIC_TRANSPORT: 'stub' });
    expect(cfg.transport).toBe('stub');
  });

  it('honours ANTHROPIC_CLI_CONCURRENCY override', () => {
    const cfg = loadClaudeAgentConfig({ ANTHROPIC_CLI_CONCURRENCY: '8' });
    expect(cfg.concurrency).toBe(8);
  });
});
