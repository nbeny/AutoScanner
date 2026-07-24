export class ClaudeResponse {
  constructor(
    public readonly text: string,
    public readonly inputTokens = 0,
    public readonly outputTokens = 0,
  ) {}

  json<T = unknown>(): T {
    let t = this.text.trim();
    if (t.startsWith('```')) {
      t = t
        .replace(/^```[a-zA-Z]*\n?/, '')
        .replace(/```$/, '')
        .trim();
    }
    try {
      return JSON.parse(t) as T;
    } catch {
      const s = t.indexOf('{');
      const e = t.lastIndexOf('}');
      if (s >= 0 && e > s) return JSON.parse(t.slice(s, e + 1)) as T;
      throw new Error('no JSON object in Claude response');
    }
  }

  safeJson<T>(fallback: T): T {
    try {
      return this.json<T>();
    } catch {
      return fallback;
    }
  }
}
