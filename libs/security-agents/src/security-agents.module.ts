import { Module } from '@nestjs/common';
import { ClaudeAgentModule, ClaudeAgentService } from '@autoscanner/claude-agent';

import { FindingAnalystAgent } from './agents/finding-analyst.agent';
import { FalsePositiveAgent } from './agents/false-positive.agent';
import { RemediationAgent } from './agents/remediation.agent';

/**
 * Provides the role-specialised AI agents over the shared Claude bridge (SP4). Each agent is a
 * stateless reasoner: input → Claude → validated output (or a deterministic fallback). The
 * Supervisor (ai-orchestrator-worker) imports this and sequences the agents.
 */
@Module({
  imports: [ClaudeAgentModule],
  providers: [
    {
      provide: FindingAnalystAgent,
      useFactory: (c: ClaudeAgentService) => new FindingAnalystAgent(c),
      inject: [ClaudeAgentService],
    },
    {
      provide: FalsePositiveAgent,
      useFactory: (c: ClaudeAgentService) => new FalsePositiveAgent(c),
      inject: [ClaudeAgentService],
    },
    {
      provide: RemediationAgent,
      useFactory: (c: ClaudeAgentService) => new RemediationAgent(c),
      inject: [ClaudeAgentService],
    },
  ],
  exports: [FindingAnalystAgent, FalsePositiveAgent, RemediationAgent],
})
export class SecurityAgentsModule {}
