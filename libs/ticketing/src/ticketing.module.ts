import { Module } from '@nestjs/common';

import { GitHubTicketAdapter } from './adapters/github.adapter';
import { JiraTicketAdapter } from './adapters/jira.adapter';

/** Provides the issue-tracker adapters (SP5). Consumers pick the adapter by provider. */
@Module({
  providers: [GitHubTicketAdapter, JiraTicketAdapter],
  exports: [GitHubTicketAdapter, JiraTicketAdapter],
})
export class TicketingModule {}
