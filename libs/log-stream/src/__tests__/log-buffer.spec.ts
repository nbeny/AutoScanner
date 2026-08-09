import { LogBuffer } from '../log-buffer';

describe('LogBuffer', () => {
  it('concatène stdout et stderr dans l’ordre d’arrivée', () => {
    const b = new LogBuffer();
    b.append('stdout', 'a');
    b.append('stderr', 'b');
    b.append('stdout', 'c');
    expect(b.snapshot()).toBe('abc');
  });

  it('expose la taille en octets UTF-8 (pas en chars)', () => {
    const b = new LogBuffer();
    b.append('stdout', 'é'); // 2 octets UTF-8
    expect(b.byteLength).toBe(2);
  });

  it('cesse d’accumuler au-delà du cap et marque la troncature une seule fois', () => {
    const b = new LogBuffer(4); // cap 4 octets
    b.append('stdout', 'abcd');
    b.append('stdout', 'efgh');
    const out = b.snapshot();
    expect(out.startsWith('abcd')).toBe(true);
    expect(out).toContain('truncated');
    b.append('stdout', 'ijkl');
    expect(out.match(/truncated/g)?.length ?? 0).toBeLessThanOrEqual(1);
  });
});
