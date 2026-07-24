import { ClaudeAgentService } from '../src/claude-agent.service';
import { StubTransport } from '../src/transports';

describe('ClaudeAgentService', () => {
  it('delegates complete() to the transport', async () => {
    const svc = new ClaudeAgentService(new StubTransport(() => '{"ok":true}'));
    const res = await svc.complete({ system: 'S', prompt: 'P' });
    expect(res.json()).toEqual({ ok: true });
  });
});
