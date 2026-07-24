import { Module } from '@nestjs/common';
import { ClaudeAgentService } from './claude-agent.service';
import { CliTransport, StubTransport, type Transport } from './transports';
import { loadClaudeAgentConfig } from './claude-agent.config';

export const CLAUDE_TRANSPORT = Symbol('CLAUDE_TRANSPORT');

@Module({
  providers: [
    {
      provide: CLAUDE_TRANSPORT,
      useFactory: (): Transport => {
        const cfg = loadClaudeAgentConfig();
        return cfg.transport === 'stub'
          ? new StubTransport(() => '{"done":true}')
          : new CliTransport(cfg);
      },
    },
    {
      provide: ClaudeAgentService,
      useFactory: (t: Transport) => new ClaudeAgentService(t),
      inject: [CLAUDE_TRANSPORT],
    },
  ],
  exports: [ClaudeAgentService],
})
export class ClaudeAgentModule {}
