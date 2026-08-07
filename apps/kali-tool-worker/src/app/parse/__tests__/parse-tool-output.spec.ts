import { parseToolOutput } from '../parse-tool-output';

describe('parseToolOutput', () => {
  it('parses a JSON object', () => {
    const r = parseToolOutput('{"a":1,"b":[2,3]}');
    expect(r.format).toBe('json');
    expect(r.view).toEqual({ a: 1, b: [2, 3] });
  });

  it('parses a JSON array even with surrounding whitespace', () => {
    expect(parseToolOutput('\n  [1,2,3]  ').format).toBe('json');
  });

  it('detects a whitespace-aligned table', () => {
    const raw = ['PORT     STATE  SERVICE', '22/tcp   open   ssh', '80/tcp   open   http'].join(
      '\n',
    );
    const r = parseToolOutput(raw);
    expect(r.format).toBe('table');
    expect(r.view).toEqual({
      headers: ['PORT', 'STATE', 'SERVICE'],
      rows: [
        ['22/tcp', 'open', 'ssh'],
        ['80/tcp', 'open', 'http'],
      ],
    });
  });

  it('detects key: value blocks', () => {
    const raw = ['Host: example.com', 'Status: up', 'Ports: 3'].join('\n');
    const r = parseToolOutput(raw);
    expect(r.format).toBe('keyvalue');
    expect(r.view).toEqual({
      pairs: [
        { key: 'Host', value: 'example.com' },
        { key: 'Status', value: 'up' },
        { key: 'Ports', value: '3' },
      ],
    });
  });

  it('strips ANSI and falls back to clean text', () => {
    const raw = '[31mred line[0m\nplain line';
    const r = parseToolOutput(raw);
    expect(r.format).toBe('text');
    expect(r.view).toEqual({ lines: ['red line', 'plain line'] });
  });

  it('returns empty text for blank input', () => {
    expect(parseToolOutput('   ')).toEqual({ format: 'text', view: { lines: [] } });
  });
});
