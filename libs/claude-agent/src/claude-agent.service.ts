import { Injectable } from '@nestjs/common';
import type { Transport, CompleteArgs } from './transports';
import { ClaudeResponse } from './claude-response';

@Injectable()
export class ClaudeAgentService {
  constructor(private readonly transport: Transport) {}

  complete(a: CompleteArgs): Promise<ClaudeResponse> {
    return this.transport.complete(a);
  }
}
