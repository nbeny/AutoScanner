import { z } from 'zod';
import type { ClaudeAgentService } from '@autoscanner/claude-agent';

import { SecurityAgent } from '../security-agent';

const schema = z.object({ answer: z.string() });
type Out = z.infer<typeof schema>;

class EchoAgent extends SecurityAgent<{ q: string }, Out> {
  readonly role = 'echo';
  protected readonly outputSchema = schema;
  protected buildSystemPrompt(): string {
    return 'sys';
  }
  protected buildUserPrompt(input: { q: string }): string {
    return `Q:${input.q}`;
  }
  protected fallback(input: { q: string }): Out {
    return { answer: `fallback:${input.q}` };
  }
}

function makeClaude(text: string | Error) {
  const complete = jest.fn(async () => {
    if (text instanceof Error) throw text;
    return { text };
  });
  return { claude: { complete } as unknown as ClaudeAgentService, complete };
}

describe('SecurityAgent.run', () => {
  it('returns the validated output when Claude returns valid fenced JSON', async () => {
    const { claude, complete } = makeClaude('```json\n{"answer":"hi"}\n```');
    const agent = new EchoAgent(claude);

    const res = await agent.run({ q: 'x' });

    expect(res).toEqual({ output: { answer: 'hi' }, degraded: false });
    expect(complete).toHaveBeenCalledWith({ system: 'sys', prompt: 'Q:x' });
  });

  it('falls back (degraded) when Claude returns empty text', async () => {
    const { claude } = makeClaude('   ');
    const res = await new EchoAgent(claude).run({ q: 'y' });
    expect(res).toEqual({ output: { answer: 'fallback:y' }, degraded: true });
  });

  it('falls back when the JSON does not match the schema', async () => {
    const { claude } = makeClaude('{"wrong":1}');
    const res = await new EchoAgent(claude).run({ q: 'z' });
    expect(res.degraded).toBe(true);
    expect(res.output).toEqual({ answer: 'fallback:z' });
  });

  it('falls back when Claude throws', async () => {
    const { claude } = makeClaude(new Error('cli died'));
    const res = await new EchoAgent(claude).run({ q: 'w' });
    expect(res).toEqual({ output: { answer: 'fallback:w' }, degraded: true });
  });

  it('falls back when the response is not JSON at all', async () => {
    const { claude } = makeClaude('I cannot help with that.');
    const res = await new EchoAgent(claude).run({ q: 'v' });
    expect(res.degraded).toBe(true);
  });
});
