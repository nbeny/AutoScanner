export interface ClaudeAgentConfig {
  transport: 'cli' | 'stub';
  cliPath: string;
  model: string;
  timeoutMs: number;
  concurrency: number;
}

export function loadClaudeAgentConfig(env: NodeJS.ProcessEnv = process.env): ClaudeAgentConfig {
  return {
    transport: (env['ANTHROPIC_TRANSPORT'] as 'cli' | 'stub') ?? 'cli',
    cliPath: env['ANTHROPIC_CLI_PATH'] ?? 'claude',
    model: env['ANTHROPIC_SONNET_MODEL'] ?? 'sonnet',
    timeoutMs: Number(env['ANTHROPIC_CLI_TIMEOUT_MS'] ?? 120000),
    concurrency: Number(env['ANTHROPIC_CLI_CONCURRENCY'] ?? 4),
  };
}
