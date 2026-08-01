import type { ClaudeAgentService } from '@autoscanner/claude-agent';

import { SecurityCopilotAgent } from '../agents/copilot.agent';

function claude(text: string | Error): ClaudeAgentService {
  return {
    complete: jest.fn(async () => {
      if (text instanceof Error) throw text;
      return { text };
    }),
  } as unknown as ClaudeAgentService;
}

describe('SecurityCopilotAgent', () => {
  it('returns the grounded answer + references from Claude', async () => {
    const res = await new SecurityCopilotAgent(
      claude('{"answer":"Fix Log4Shell first","references":["Log4Shell"]}'),
    ).run({ question: 'what first?', context: '- [CRITICAL] Log4Shell' });

    expect(res.degraded).toBe(false);
    expect(res.output).toMatchObject({ answer: 'Fix Log4Shell first', references: ['Log4Shell'] });
  });

  it('passes CONTEXT and QUESTION to Claude', async () => {
    const c = claude('{"answer":"a","references":[]}');
    await new SecurityCopilotAgent(c).run({ question: 'Q', context: 'CTX' });
    const prompt = (c.complete as jest.Mock).mock.calls[0][0].prompt as string;
    expect(prompt).toContain('CTX');
    expect(prompt).toContain('Q');
  });

  it('falls back to a safe message when Claude is unavailable', async () => {
    const res = await new SecurityCopilotAgent(claude(new Error('quota'))).run({
      question: 'q',
      context: 'c',
    });
    expect(res.degraded).toBe(true);
    expect(res.output.answer).toContain('unavailable');
  });
});
