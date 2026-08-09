import { isTransientStorageError, retryTransient } from '../retry';

describe('isTransientStorageError', () => {
  it('détecte les erreurs réseau transitoires par code', () => {
    expect(isTransientStorageError({ code: 'ECONNRESET' })).toBe(true);
    expect(isTransientStorageError({ name: 'ECONNRESET' })).toBe(true);
    expect(isTransientStorageError(Object.assign(new Error('read ECONNRESET'), {}))).toBe(true);
    expect(isTransientStorageError({ code: 'EPIPE' })).toBe(true);
    expect(isTransientStorageError({ code: 'ETIMEDOUT' })).toBe(true);
    expect(isTransientStorageError({ name: 'TimeoutError' })).toBe(true);
    expect(isTransientStorageError({ $metadata: { httpStatusCode: 503 } })).toBe(true);
  });
  it('ignore les erreurs non transitoires', () => {
    expect(isTransientStorageError({ name: 'NoSuchBucket' })).toBe(false);
    expect(isTransientStorageError({ $metadata: { httpStatusCode: 404 } })).toBe(false);
    expect(isTransientStorageError(new Error('bad key'))).toBe(false);
    expect(isTransientStorageError(null)).toBe(false);
  });
});

describe('retryTransient', () => {
  const noSleep = () => Promise.resolve();

  it('réessaie puis réussit sur erreur transitoire', async () => {
    let calls = 0;
    const fn = jest.fn(async () => {
      calls += 1;
      if (calls < 3) throw { code: 'ECONNRESET' };
      return 'ok';
    });
    const res = await retryTransient(fn, { attempts: 5, baseDelayMs: 1, sleep: noSleep });
    expect(res).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('ne réessaie pas une erreur non transitoire', async () => {
    const fn = jest.fn(async () => {
      throw { name: 'NoSuchBucket' };
    });
    await expect(
      retryTransient(fn, { attempts: 5, baseDelayMs: 1, sleep: noSleep }),
    ).rejects.toMatchObject({ name: 'NoSuchBucket' });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('abandonne après avoir épuisé les tentatives', async () => {
    const fn = jest.fn(async () => {
      throw { code: 'ECONNRESET' };
    });
    await expect(
      retryTransient(fn, { attempts: 3, baseDelayMs: 1, sleep: noSleep }),
    ).rejects.toMatchObject({ code: 'ECONNRESET' });
    expect(fn).toHaveBeenCalledTimes(3);
  });
});
