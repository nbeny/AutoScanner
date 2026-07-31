export const JOB_BUS = Symbol('JOB_BUS');

export interface PublishOpts {
  attempt?: number;
  availableAt?: Date;
}

export interface JobBus {
  publish<T>(topic: string, key: string, payload: T, opts?: PublishOpts): Promise<void>;
}

export interface MessageContext<T> {
  id: string;
  type: string;
  key: string;
  attempt: number;
  payload: T;
}

export abstract class MessageConsumer<T = unknown> {
  abstract readonly topic: string;
  abstract process(ctx: MessageContext<T>): Promise<void>;
}
