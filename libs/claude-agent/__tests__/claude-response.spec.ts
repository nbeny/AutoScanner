import { ClaudeResponse } from '../src/claude-response';

describe('ClaudeResponse', () => {
  it('parses raw JSON', () => {
    const r = new ClaudeResponse('{"done":true}');
    expect(r.json()).toEqual({ done: true });
  });

  it('strips markdown ```json fences', () => {
    const r = new ClaudeResponse('```json\n{"a":1}\n```');
    expect(r.json()).toEqual({ a: 1 });
  });

  it('extracts first {...} object from surrounding prose', () => {
    const r = new ClaudeResponse('Sure, here it is: {"x":2} — hope that helps.');
    expect(r.json()).toEqual({ x: 2 });
  });

  it('throws when no JSON object is present', () => {
    const r = new ClaudeResponse('no json here');
    expect(() => r.json()).toThrow('no JSON object in Claude response');
  });

  it('safeJson returns fallback on empty text', () => {
    const r = new ClaudeResponse('');
    expect(r.safeJson({ fallback: true })).toEqual({ fallback: true });
  });

  it('exposes token counts', () => {
    const r = new ClaudeResponse('{}', 12, 34);
    expect(r.inputTokens).toBe(12);
    expect(r.outputTokens).toBe(34);
  });
});
