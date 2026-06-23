import { authHeaderLines } from '../auth';

describe('authHeaderLines', () => {
  it('returns an empty array when auth is undefined or empty', () => {
    expect(authHeaderLines(undefined)).toEqual([]);
    expect(authHeaderLines({})).toEqual([]);
  });

  it('renders the cookie as a Cookie header first', () => {
    expect(authHeaderLines({ cookie: 'session=abc' })).toEqual(['Cookie: session=abc']);
  });

  it('renders arbitrary headers after the cookie', () => {
    expect(
      authHeaderLines({
        cookie: 'session=abc',
        headers: { Authorization: 'Bearer xyz', 'X-Api-Key': 'k' },
      }),
    ).toEqual(['Cookie: session=abc', 'Authorization: Bearer xyz', 'X-Api-Key: k']);
  });

  it('skips empty cookie and empty header names', () => {
    expect(authHeaderLines({ cookie: '', headers: { '': 'v', A: 'b' } })).toEqual(['A: b']);
  });
});
