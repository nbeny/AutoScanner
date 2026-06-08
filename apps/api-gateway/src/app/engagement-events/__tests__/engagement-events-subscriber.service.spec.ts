import { EventEmitter } from 'node:events';

import { encodeEngagementEvent, EngagementUpdateKind } from '@autoscanner/engagement-events';

import {
  EngagementEventsSubscriberService,
  type IORedisSubscribeLike,
} from '../engagement-events-subscriber.service';

class FakeRedis extends EventEmitter implements IORedisSubscribeLike {
  channels = new Set<string>();
  subscribe = jest.fn(async (channel: string) => {
    this.channels.add(channel);
  });
  unsubscribe = jest.fn(async (channel: string) => {
    this.channels.delete(channel);
  });
  quit = jest.fn(async () => 'OK');
  emitMessage(channel: string, msg: string): void {
    this.emit('message', channel, msg);
  }
}

function makeEvent(kind = EngagementUpdateKind.ASSET_ADDED) {
  return {
    kind,
    engagementId: 'eng_1',
    assetId: 'asset_1',
    ts: '2026-06-08T00:00:00.000Z',
  };
}

describe('EngagementEventsSubscriberService', () => {
  it('lazy-subscribes to channel on first iterator and unsubscribes on last close', async () => {
    const redis = new FakeRedis();
    const svc = new EngagementEventsSubscriberService(redis);
    svc.onModuleInit();

    const it = svc.subscribe('eng_1')[Symbol.asyncIterator]();
    await new Promise((r) => setImmediate(r));
    expect(redis.subscribe).toHaveBeenCalledWith('engagement:eng_1:updates');

    await it.return!();
    expect(redis.unsubscribe).toHaveBeenCalledWith('engagement:eng_1:updates');
  });

  it('does not double-subscribe with multiple iterators on same channel', async () => {
    const redis = new FakeRedis();
    const svc = new EngagementEventsSubscriberService(redis);
    svc.onModuleInit();

    const it1 = svc.subscribe('eng_1')[Symbol.asyncIterator]();
    const it2 = svc.subscribe('eng_1')[Symbol.asyncIterator]();
    await new Promise((r) => setImmediate(r));
    expect(redis.subscribe).toHaveBeenCalledTimes(1);

    await it1.return!();
    expect(redis.unsubscribe).not.toHaveBeenCalled();

    await it2.return!();
    expect(redis.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('dispatches decoded events to subscribed iterators', async () => {
    const redis = new FakeRedis();
    const svc = new EngagementEventsSubscriberService(redis);
    svc.onModuleInit();

    const it = svc.subscribe('eng_1')[Symbol.asyncIterator]();
    const ev = makeEvent();
    redis.emitMessage('engagement:eng_1:updates', encodeEngagementEvent(ev));

    const result = await it.next();
    expect(result.done).toBe(false);
    expect(result.value).toEqual(ev);
    await it.return!();
  });

  it('drops malformed payloads without crashing', async () => {
    const redis = new FakeRedis();
    const svc = new EngagementEventsSubscriberService(redis);
    svc.onModuleInit();

    const it = svc.subscribe('eng_1')[Symbol.asyncIterator]();
    redis.emitMessage('engagement:eng_1:updates', '{ not json');
    redis.emitMessage('engagement:eng_1:updates', encodeEngagementEvent(makeEvent()));
    const result = await it.next();
    expect(result.done).toBe(false);
    expect(result.value.kind).toBe(EngagementUpdateKind.ASSET_ADDED);
    await it.return!();
  });

  it('quits redis on module destroy', async () => {
    const redis = new FakeRedis();
    const svc = new EngagementEventsSubscriberService(redis);
    svc.onModuleInit();
    await svc.onModuleDestroy();
    expect(redis.quit).toHaveBeenCalled();
  });
});
