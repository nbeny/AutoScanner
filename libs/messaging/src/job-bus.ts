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
  /**
   * Kafka consumer group. Defaults to the topic name (one owning group per work queue). Set it
   * only when MULTIPLE services consume the SAME topic and each must receive every message —
   * e.g. the `security.finding.created` fan-out to threat-intel and compliance. Two consumers
   * sharing a group compete for messages; distinct groups each get the full stream.
   */
  readonly groupId?: string;
  /**
   * Handles one message. A thrown error routes the message to the retry/DLQ topics.
   * Any resolved value is ignored by the runner — some consumers return a summary
   * for their own tests/callers.
   */
  abstract process(ctx: MessageContext<T>): Promise<unknown>;
}
