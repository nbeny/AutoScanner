import { randomUUID } from 'node:crypto';

export interface Envelope<T = unknown> {
  id: string;
  type: string;
  key: string;
  occurredAt: string;
  attempt: number;
  availableAt?: string;
  payload: T;
}

export function wrap<T>(
  type: string,
  key: string,
  payload: T,
  opts: { attempt?: number; availableAt?: Date; id?: string } = {},
): Envelope<T> {
  return {
    id: opts.id ?? randomUUID(),
    type,
    key,
    occurredAt: new Date().toISOString(),
    attempt: opts.attempt ?? 1,
    availableAt: opts.availableAt?.toISOString(),
    payload,
  };
}

export function unwrap<T>(buf: Buffer | string): Envelope<T> {
  try {
    const obj = JSON.parse(typeof buf === 'string' ? buf : buf.toString('utf8'));
    if (!obj || typeof obj.type !== 'string' || typeof obj.attempt !== 'number') {
      throw new Error('missing fields');
    }
    return obj as Envelope<T>;
  } catch (e) {
    throw new Error(`invalid message envelope: ${(e as Error).message}`);
  }
}
