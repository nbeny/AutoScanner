import { CsvRenderer } from '../csv-renderer';

describe('CsvRenderer', () => {
  const renderer = new CsvRenderer();

  it('renders header + rows', () => {
    const out = renderer.render(
      [
        { id: '1', name: 'alpha', score: 7.5 },
        { id: '2', name: 'beta', score: 9.0 },
      ],
      ['id', 'name', 'score'],
    );
    const lines = out.trim().split('\n');
    expect(lines[0]).toBe('id,name,score');
    expect(lines[1]).toBe('1,alpha,7.5');
    expect(lines[2]).toBe('2,beta,9');
  });

  it('quotes/escapes special characters', () => {
    const out = renderer.render(
      [{ msg: 'hello, world' }, { msg: 'she said "hi"' }, { msg: 'line1\nline2' }],
      ['msg'],
    );
    const lines = out.split('\n').filter((l) => l.length > 0 || out.includes('\n'));
    expect(out).toContain('"hello, world"');
    expect(out).toContain('"she said ""hi"""');
    expect(out).toContain('"line1\nline2"');
    expect(lines.length).toBeGreaterThanOrEqual(2);
  });

  it('renders null/undefined as empty string', () => {
    const out = renderer.render([{ a: 'x', b: null, c: undefined }], ['a', 'b', 'c']);
    expect(out.trim().split('\n')[1]).toBe('x,,');
  });

  it('serializes Date as ISO and object as JSON', () => {
    const d = new Date('2026-06-12T14:30:00Z');
    const out = renderer.render([{ d, o: { a: 1 } }], ['d', 'o']);
    expect(out).toContain('2026-06-12T14:30:00.000Z');
    expect(out).toContain('"{""a"":1}"');
  });
});
