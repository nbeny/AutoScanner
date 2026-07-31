import {
  NotFoundException,
  PayloadTooLargeException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';

import type { PrismaService } from '@autoscanner/database';
import type { JobBus } from '@autoscanner/messaging';

import { WebhooksService } from '../webhooks.service';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const GENERIC_TOKEN = 'secret-generic-token';
const ZAP_TOKEN = 'secret-zap-token';
const BURP_TOKEN = 'secret-burp-token';

const EVENT_ID = 'wh_event_1';
const IP = '1.2.3.4';

function makeEvent(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: EVENT_ID,
    source: 'generic',
    payload: { engagementId: 'eng_1', findings: [] },
    receivedFromIp: IP,
    receivedAt: new Date(),
    processedAt: null,
    resultingScanId: null,
    errorMessage: null,
    ...overrides,
  };
}

function makeMockCfg(
  overrides: {
    WEBHOOK_GENERIC_TOKEN?: string;
    WEBHOOK_ZAP_TOKEN?: string;
    WEBHOOK_BURP_TOKEN?: string;
  } = {},
) {
  return {
    env: {
      WEBHOOK_GENERIC_TOKEN: GENERIC_TOKEN,
      WEBHOOK_ZAP_TOKEN: ZAP_TOKEN,
      WEBHOOK_BURP_TOKEN: BURP_TOKEN,
      ...overrides,
    },
  };
}

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('WebhooksService', () => {
  let prisma: jest.Mocked<PrismaService>;
  let bus: jest.Mocked<JobBus>;
  let cfg: ReturnType<typeof makeMockCfg>;
  let svc: WebhooksService;

  beforeEach(() => {
    jest.clearAllMocks();

    prisma = {
      webhookEvent: {
        create: jest.fn().mockResolvedValue(makeEvent()),
        update: jest.fn().mockResolvedValue(makeEvent()),
      },
    } as unknown as jest.Mocked<PrismaService>;

    bus = {
      publish: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<JobBus>;

    cfg = makeMockCfg();

    svc = new WebhooksService(prisma, bus, cfg as never);
  });

  // ─── tokenForSource ──────────────────────────────────────────────────────

  describe('tokenForSource', () => {
    it('returns WEBHOOK_GENERIC_TOKEN for "generic"', () => {
      expect(svc.tokenForSource('generic')).toBe(GENERIC_TOKEN);
    });

    it('returns WEBHOOK_ZAP_TOKEN for "zap"', () => {
      expect(svc.tokenForSource('zap')).toBe(ZAP_TOKEN);
    });

    it('returns WEBHOOK_BURP_TOKEN for "burp"', () => {
      expect(svc.tokenForSource('burp')).toBe(BURP_TOKEN);
    });

    it('returns undefined for an unknown source', () => {
      expect(svc.tokenForSource('unknown')).toBeUndefined();
    });
  });

  // ─── verifyToken ─────────────────────────────────────────────────────────

  describe('verifyToken', () => {
    it('throws ServiceUnavailableException when source token is not configured', () => {
      const unconfiguredSvc = new WebhooksService(
        prisma,
        bus,
        makeMockCfg({ WEBHOOK_GENERIC_TOKEN: undefined }) as never,
      );

      expect(() => unconfiguredSvc.verifyToken('generic', GENERIC_TOKEN)).toThrow(
        ServiceUnavailableException,
      );
    });

    it('throws ServiceUnavailableException when configured token is an empty string', () => {
      // An empty WEBHOOK_GENERIC_TOKEN= in env must not silently pass through;
      // treat it the same as unconfigured → 503.
      const emptySvc = new WebhooksService(
        prisma,
        bus,
        makeMockCfg({ WEBHOOK_GENERIC_TOKEN: '' }) as never,
      );

      expect(() => emptySvc.verifyToken('generic', GENERIC_TOKEN)).toThrow(
        ServiceUnavailableException,
      );
    });

    it('throws UnauthorizedException when provided token is missing (undefined)', () => {
      expect(() => svc.verifyToken('generic', undefined as unknown as string)).toThrow(
        UnauthorizedException,
      );
    });

    it('throws UnauthorizedException when provided token is empty string', () => {
      expect(() => svc.verifyToken('generic', '')).toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when token is wrong', () => {
      expect(() => svc.verifyToken('generic', 'wrong-token')).toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when token length differs (constant-time guard)', () => {
      // Different length should reject without calling timingSafeEqual on mismatched buffers
      expect(() => svc.verifyToken('generic', 'x')).toThrow(UnauthorizedException);
    });

    it('does NOT throw when token matches', () => {
      expect(() => svc.verifyToken('generic', GENERIC_TOKEN)).not.toThrow();
    });

    it('does NOT throw for zap with correct zap token', () => {
      expect(() => svc.verifyToken('zap', ZAP_TOKEN)).not.toThrow();
    });

    it('does NOT throw for burp with correct burp token', () => {
      expect(() => svc.verifyToken('burp', BURP_TOKEN)).not.toThrow();
    });
  });

  // ─── ingest ──────────────────────────────────────────────────────────────

  describe('ingest', () => {
    const validPayload = { engagementId: 'eng_1', findings: [] };

    it('throws NotFoundException for an unknown source', async () => {
      await expect(svc.ingest('badSource', validPayload, IP)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.webhookEvent.create).not.toHaveBeenCalled();
    });

    it('throws PayloadTooLargeException when serialized payload exceeds 5 MB', async () => {
      // Build an object that serializes to just over 5 MB
      const bigPayload = { engagementId: 'eng_1', data: 'x'.repeat(5_242_881) };

      await expect(svc.ingest('generic', bigPayload, IP)).rejects.toBeInstanceOf(
        PayloadTooLargeException,
      );
      expect(prisma.webhookEvent.create).not.toHaveBeenCalled();
    });

    it('inserts a WebhookEvent row with source, payload, and receivedFromIp', async () => {
      const event = makeEvent();
      (prisma.webhookEvent.create as jest.Mock).mockResolvedValue(event);

      await svc.ingest('generic', validPayload, IP);

      const createArg = (prisma.webhookEvent.create as jest.Mock).mock.calls[0][0];
      expect(createArg.data).toEqual(
        expect.objectContaining({
          source: 'generic',
          payload: validPayload,
          receivedFromIp: IP,
        }),
      );
    });

    it('enqueues a webhook-jobs job with { webhookEventId }', async () => {
      const event = makeEvent();
      (prisma.webhookEvent.create as jest.Mock).mockResolvedValue(event);

      await svc.ingest('generic', validPayload, IP);

      expect(bus.publish).toHaveBeenCalledWith('security.webhook.ingest.requested', event.id, {
        webhookEventId: event.id,
      });
    });

    it('returns { webhookEventId } matching the inserted event id', async () => {
      const event = makeEvent();
      (prisma.webhookEvent.create as jest.Mock).mockResolvedValue(event);

      const result = await svc.ingest('generic', validPayload, IP);

      expect(result).toEqual({ webhookEventId: event.id });
    });

    it('stores null for receivedFromIp when ip is undefined', async () => {
      const event = makeEvent({ receivedFromIp: null });
      (prisma.webhookEvent.create as jest.Mock).mockResolvedValue(event);

      await svc.ingest('generic', validPayload, undefined);

      const createArg = (prisma.webhookEvent.create as jest.Mock).mock.calls[0][0];
      expect(createArg.data.receivedFromIp).toBeNull();
    });

    it('on enqueue failure: updates event errorMessage and rethrows the original error', async () => {
      const event = makeEvent();
      (prisma.webhookEvent.create as jest.Mock).mockResolvedValue(event);
      const enqueueError = new Error('redis-down');
      (bus.publish as jest.Mock).mockRejectedValueOnce(enqueueError);
      (prisma.webhookEvent.update as jest.Mock).mockResolvedValue(event);

      await expect(svc.ingest('generic', validPayload, IP)).rejects.toThrow('redis-down');

      expect(prisma.webhookEvent.update).toHaveBeenCalledWith({
        where: { id: event.id },
        data: expect.objectContaining({
          errorMessage: expect.stringContaining('redis-down'),
        }),
      });
    });
  });
});
