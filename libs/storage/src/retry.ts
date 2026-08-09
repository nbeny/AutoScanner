/** Codes/noms d'erreurs réseau transitoires qu'il vaut la peine de réessayer. */
const TRANSIENT_CODES = new Set([
  'ECONNRESET',
  'EPIPE',
  'ETIMEDOUT',
  'ECONNABORTED',
  'EAI_AGAIN',
  'EHOSTUNREACH',
  'ENETUNREACH',
]);
const TRANSIENT_NAMES = new Set(['TimeoutError', 'RequestTimeout', 'RequestTimeoutException']);
const TRANSIENT_STATUS = new Set([500, 502, 503, 504]);

/**
 * Vrai si l'erreur ressemble à un aléa réseau transitoire (socket reset, timeout,
 * 5xx passager) — par opposition à une erreur applicative (404, NoSuchBucket, clé
 * invalide) qu'il ne faut jamais réessayer.
 */
export function isTransientStorageError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as {
    code?: string;
    name?: string;
    message?: string;
    $metadata?: { httpStatusCode?: number };
  };
  if (e.code && TRANSIENT_CODES.has(e.code)) return true;
  if (e.name && (TRANSIENT_CODES.has(e.name) || TRANSIENT_NAMES.has(e.name))) return true;
  const status = e.$metadata?.httpStatusCode;
  if (typeof status === 'number' && TRANSIENT_STATUS.has(status)) return true;
  if (typeof e.message === 'string') {
    const m = e.message;
    if (m.includes('ECONNRESET') || m.includes('socket hang up') || m.includes('EPIPE'))
      return true;
  }
  return false;
}

export interface RetryOptions {
  /** Nombre total de tentatives (>=1). */
  attempts?: number;
  /** Délai de base du backoff exponentiel, en ms. */
  baseDelayMs?: number;
  /** Injection pour les tests. */
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Exécute `fn` en réessayant UNIQUEMENT les erreurs transitoires, avec backoff
 * exponentiel (baseDelayMs * 2^n). Les erreurs non transitoires sont relancées
 * immédiatement. La dernière erreur est relancée après épuisement des tentatives.
 */
export async function retryTransient<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const attempts = Math.max(1, opts.attempts ?? 4);
  const baseDelayMs = opts.baseDelayMs ?? 100;
  const sleep = opts.sleep ?? defaultSleep;
  let lastErr: unknown;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isTransientStorageError(err) || i === attempts - 1) throw err;
      await sleep(baseDelayMs * 2 ** i);
    }
  }
  throw lastErr;
}
