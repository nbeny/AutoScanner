import { EmailAdapter } from '../adapters/email.adapter';
import { SlackAdapter } from '../adapters/slack.adapter';
import { DiscordAdapter } from '../adapters/discord.adapter';
import { GenericWebhookAdapter } from '../adapters/generic-webhook.adapter';
import type { MailTransport, DeliveryContext } from '../adapters/adapter.types';
import { RenderedMessage } from '../event-types';

const message: RenderedMessage = {
  subject: 'Test Subject',
  body: 'Test body content',
};

// ─── EmailAdapter ───────────────────────────────────────────────────────────

describe('EmailAdapter', () => {
  let transport: jest.Mocked<MailTransport>;

  beforeEach(() => {
    transport = { sendMail: jest.fn().mockResolvedValue(undefined) };
  });

  it('has type EMAIL', () => {
    const adapter = new EmailAdapter(transport, 'no-reply@example.com');
    expect(adapter.type).toBe('EMAIL');
  });

  it('calls sendMail with correct params', async () => {
    const adapter = new EmailAdapter(transport, 'no-reply@example.com');
    const ctx: DeliveryContext = {
      type: 'EMAIL',
      config: { to: 'user@example.com' },
      message,
    };
    await adapter.send(ctx);
    expect(transport.sendMail).toHaveBeenCalledWith({
      to: 'user@example.com',
      from: 'no-reply@example.com',
      subject: 'Test Subject',
      text: 'Test body content',
    });
  });

  it('uses config.from when provided', async () => {
    const adapter = new EmailAdapter(transport, 'default@example.com');
    const ctx: DeliveryContext = {
      type: 'EMAIL',
      config: { to: 'user@example.com', from: 'custom@example.com' },
      message,
    };
    await adapter.send(ctx);
    expect(transport.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ from: 'custom@example.com' }),
    );
  });
});

// ─── SlackAdapter ────────────────────────────────────────────────────────────

describe('SlackAdapter', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
    } as Response);
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('has type SLACK', () => {
    expect(new SlackAdapter().type).toBe('SLACK');
  });

  it('POSTs to webhookUrl with correct JSON body', async () => {
    const adapter = new SlackAdapter();
    const ctx: DeliveryContext = {
      type: 'SLACK',
      config: { webhookUrl: 'https://hooks.slack.com/test' },
      message,
    };
    await adapter.send(ctx);
    expect(fetchSpy).toHaveBeenCalledWith('https://hooks.slack.com/test', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: `*${message.subject}*\n${message.body}` }),
    });
  });

  it('throws on non-2xx response', async () => {
    fetchSpy.mockResolvedValue({ ok: false, status: 400 } as Response);
    const adapter = new SlackAdapter();
    const ctx: DeliveryContext = {
      type: 'SLACK',
      config: { webhookUrl: 'https://hooks.slack.com/test' },
      message,
    };
    await expect(adapter.send(ctx)).rejects.toThrow();
  });
});

// ─── DiscordAdapter ──────────────────────────────────────────────────────────

describe('DiscordAdapter', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 204,
    } as Response);
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('has type DISCORD', () => {
    expect(new DiscordAdapter().type).toBe('DISCORD');
  });

  it('POSTs to webhookUrl with correct JSON body', async () => {
    const adapter = new DiscordAdapter();
    const ctx: DeliveryContext = {
      type: 'DISCORD',
      config: { webhookUrl: 'https://discord.com/api/webhooks/test' },
      message,
    };
    await adapter.send(ctx);
    expect(fetchSpy).toHaveBeenCalledWith('https://discord.com/api/webhooks/test', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content: `**${message.subject}**\n${message.body}` }),
    });
  });

  it('throws on non-2xx response', async () => {
    fetchSpy.mockResolvedValue({ ok: false, status: 500 } as Response);
    const adapter = new DiscordAdapter();
    const ctx: DeliveryContext = {
      type: 'DISCORD',
      config: { webhookUrl: 'https://discord.com/api/webhooks/test' },
      message,
    };
    await expect(adapter.send(ctx)).rejects.toThrow();
  });
});

// ─── GenericWebhookAdapter ───────────────────────────────────────────────────

describe('GenericWebhookAdapter', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
    } as Response);
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('has type WEBHOOK', () => {
    expect(new GenericWebhookAdapter().type).toBe('WEBHOOK');
  });

  it('POSTs to url with subject and body', async () => {
    const adapter = new GenericWebhookAdapter();
    const ctx: DeliveryContext = {
      type: 'WEBHOOK',
      config: { url: 'https://example.com/hook' },
      message,
    };
    await adapter.send(ctx);
    const expectedBody = JSON.stringify({ subject: message.subject, body: message.body });
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://example.com/hook',
      expect.objectContaining({
        method: 'POST',
        body: expectedBody,
      }),
    );
  });

  it('adds x-autoscanner-signature header when secret is present', async () => {
    const crypto = await import('crypto');
    const secret = 'my-secret';
    const adapter = new GenericWebhookAdapter();
    const ctx: DeliveryContext = {
      type: 'WEBHOOK',
      config: { url: 'https://example.com/hook', secret },
      message,
    };
    await adapter.send(ctx);
    const body = JSON.stringify({ subject: message.subject, body: message.body });
    const expectedSig = crypto.createHmac('sha256', secret).update(body).digest('hex');
    const callArgs = fetchSpy.mock.calls[0] as [string, RequestInit];
    const headers = callArgs[1].headers as Record<string, string>;
    expect(headers['x-autoscanner-signature']).toBe(expectedSig);
  });

  it('does not add signature header when no secret', async () => {
    const adapter = new GenericWebhookAdapter();
    const ctx: DeliveryContext = {
      type: 'WEBHOOK',
      config: { url: 'https://example.com/hook' },
      message,
    };
    await adapter.send(ctx);
    const callArgs = fetchSpy.mock.calls[0] as [string, RequestInit];
    const headers = callArgs[1].headers as Record<string, string>;
    expect(headers['x-autoscanner-signature']).toBeUndefined();
  });

  it('throws on non-2xx response', async () => {
    fetchSpy.mockResolvedValue({ ok: false, status: 500 } as Response);
    const adapter = new GenericWebhookAdapter();
    const ctx: DeliveryContext = {
      type: 'WEBHOOK',
      config: { url: 'https://example.com/hook' },
      message,
    };
    await expect(adapter.send(ctx)).rejects.toThrow();
  });
});
