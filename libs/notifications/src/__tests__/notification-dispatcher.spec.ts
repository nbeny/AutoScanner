import { NotificationDispatcher } from '../notification-dispatcher';
import type { NotificationAdapter, DeliveryContext } from '../adapters/adapter.types';
import type { NotificationChannelType } from '@prisma/client';
import { RenderedMessage } from '../event-types';

const makeAdapter = (type: NotificationChannelType): jest.Mocked<NotificationAdapter> => ({
  type,
  send: jest.fn().mockResolvedValue(undefined),
});

const message: RenderedMessage = { subject: 'Test', body: 'Body' };

describe('NotificationDispatcher', () => {
  it('routes dispatch to the correct adapter', async () => {
    const emailAdapter = makeAdapter('EMAIL');
    const slackAdapter = makeAdapter('SLACK');
    const dispatcher = new NotificationDispatcher([emailAdapter, slackAdapter]);

    const ctx: DeliveryContext = { type: 'EMAIL', config: { to: 'u@e.com' }, message };
    await dispatcher.dispatch('EMAIL', { to: 'u@e.com' }, message);

    expect(emailAdapter.send).toHaveBeenCalledWith(ctx);
    expect(slackAdapter.send).not.toHaveBeenCalled();
  });

  it('routes to SLACK adapter', async () => {
    const slackAdapter = makeAdapter('SLACK');
    const dispatcher = new NotificationDispatcher([slackAdapter]);

    await dispatcher.dispatch('SLACK', { webhookUrl: 'https://slack.test' }, message);

    expect(slackAdapter.send).toHaveBeenCalledWith({
      type: 'SLACK',
      config: { webhookUrl: 'https://slack.test' },
      message,
    });
  });

  it('throws when no adapter registered for type', async () => {
    const dispatcher = new NotificationDispatcher([]);
    await expect(dispatcher.dispatch('DISCORD', {}, message)).rejects.toThrow(
      'no adapter for DISCORD',
    );
  });

  it('throws with correct message for unknown type', async () => {
    const emailAdapter = makeAdapter('EMAIL');
    const dispatcher = new NotificationDispatcher([emailAdapter]);
    await expect(dispatcher.dispatch('WEBHOOK', {}, message)).rejects.toThrow(
      'no adapter for WEBHOOK',
    );
  });
});
