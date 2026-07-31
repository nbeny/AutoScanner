import { DeliveryStatus, NotificationChannelType } from '@prisma/client';

import { NotFoundError, ValidationError } from '@autoscanner/common';
import type { PrismaService } from '@autoscanner/database';
import type { JobBus } from '@autoscanner/messaging';

import { NotificationsService } from '../notifications.service';

const USER_ID = 'user_1';
const CHANNEL_ID = 'ch_1';

const SEALED_BUFFER = Buffer.from('sealed');

const mockSecretBox = {
  seal: jest.fn().mockReturnValue(SEALED_BUFFER),
  open: jest.fn(),
};

function makeChannel(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: CHANNEL_ID,
    userId: USER_ID,
    name: 'My Slack',
    type: NotificationChannelType.SLACK,
    configEncrypted: SEALED_BUFFER,
    enabled: true,
    eventFilters: ['scan.completed'],
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  };
}

function makeNotification(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'notif_1',
    channelId: CHANNEL_ID,
    eventType: 'test',
    payload: { engagementId: 'test', engagementName: 'Test channel' },
    deliveryStatus: DeliveryStatus.PENDING,
    attemptCount: 0,
    lastAttemptAt: null,
    errorMessage: null,
    sentAt: null,
    createdAt: new Date(),
    ...overrides,
  };
}

describe('NotificationsService', () => {
  let prisma: jest.Mocked<PrismaService>;
  let bus: jest.Mocked<JobBus>;
  let svc: NotificationsService;

  beforeEach(() => {
    jest.clearAllMocks();

    prisma = {
      notificationChannel: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      notification: {
        create: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
    } as unknown as jest.Mocked<PrismaService>;

    bus = {
      publish: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<JobBus>;

    svc = new NotificationsService(prisma, mockSecretBox as never, bus);
  });

  // ─── createChannel ───────────────────────────────────────────────────────────

  describe('createChannel', () => {
    const validInput = {
      name: 'My Slack',
      type: NotificationChannelType.SLACK,
      eventFilters: ['scan.completed'],
      config: { webhookUrl: 'https://hooks.slack.com/xxx' },
    };

    it('seals the config and stores configEncrypted as the sealed buffer', async () => {
      (prisma.notificationChannel.create as jest.Mock).mockResolvedValue(makeChannel());

      await svc.createChannel(USER_ID, validInput);

      expect(mockSecretBox.seal).toHaveBeenCalledWith(JSON.stringify(validInput.config));

      const createArg = (prisma.notificationChannel.create as jest.Mock).mock.calls[0][0];
      expect(createArg.data.configEncrypted).toBe(SEALED_BUFFER);
    });

    it('persists eventFilters, userId, name, type, enabled:true', async () => {
      (prisma.notificationChannel.create as jest.Mock).mockResolvedValue(makeChannel());

      await svc.createChannel(USER_ID, validInput);

      const createArg = (prisma.notificationChannel.create as jest.Mock).mock.calls[0][0];
      expect(createArg.data).toEqual(
        expect.objectContaining({
          userId: USER_ID,
          name: validInput.name,
          type: validInput.type,
          eventFilters: validInput.eventFilters,
          enabled: true,
        }),
      );
    });

    it('throws ValidationError and does not create when eventFilters is empty', async () => {
      await expect(
        svc.createChannel(USER_ID, { ...validInput, eventFilters: [] }),
      ).rejects.toBeInstanceOf(ValidationError);

      expect(prisma.notificationChannel.create).not.toHaveBeenCalled();
      expect(mockSecretBox.seal).not.toHaveBeenCalled();
    });
  });

  // ─── listChannels ─────────────────────────────────────────────────────────────

  describe('listChannels', () => {
    it('queries with userId + deletedAt:null filter, orders by createdAt desc', async () => {
      (prisma.notificationChannel.findMany as jest.Mock).mockResolvedValue([makeChannel()]);

      await svc.listChannels(USER_ID);

      expect(prisma.notificationChannel.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: USER_ID, deletedAt: null },
          orderBy: { createdAt: 'desc' },
        }),
      );
    });

    it('returns rows (service layer does not strip fields — DTO/resolver is responsible)', async () => {
      const channels = [makeChannel()];
      (prisma.notificationChannel.findMany as jest.Mock).mockResolvedValue(channels);

      const result = await svc.listChannels(USER_ID);

      // configEncrypted is present in the raw row but must NOT be included in a select
      // that exposes config. Verify query has no select that includes configEncrypted.
      const callArg = (prisma.notificationChannel.findMany as jest.Mock).mock.calls[0][0] as {
        select?: Record<string, unknown>;
      };
      expect(callArg.select).toBeUndefined(); // full row returned, resolver drops config field via DTO shape

      expect(result).toEqual(channels);
    });
  });

  // ─── updateChannel ────────────────────────────────────────────────────────────

  describe('updateChannel', () => {
    it('throws NotFoundError when channel is not owned by user', async () => {
      (prisma.notificationChannel.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(svc.updateChannel(USER_ID, 'missing', { name: 'x' })).rejects.toBeInstanceOf(
        NotFoundError,
      );

      expect(prisma.notificationChannel.update).not.toHaveBeenCalled();
    });

    it('re-seals config when config is provided', async () => {
      (prisma.notificationChannel.findFirst as jest.Mock).mockResolvedValue(makeChannel());
      (prisma.notificationChannel.update as jest.Mock).mockResolvedValue(makeChannel());

      const newConfig = { webhookUrl: 'https://hooks.slack.com/new' };
      await svc.updateChannel(USER_ID, CHANNEL_ID, { config: newConfig });

      expect(mockSecretBox.seal).toHaveBeenCalledWith(JSON.stringify(newConfig));

      const updateArg = (prisma.notificationChannel.update as jest.Mock).mock.calls[0][0];
      expect(updateArg.data.configEncrypted).toBe(SEALED_BUFFER);
    });

    it('does NOT call seal when config is not provided', async () => {
      (prisma.notificationChannel.findFirst as jest.Mock).mockResolvedValue(makeChannel());
      (prisma.notificationChannel.update as jest.Mock).mockResolvedValue(makeChannel());

      await svc.updateChannel(USER_ID, CHANNEL_ID, { enabled: false });

      expect(mockSecretBox.seal).not.toHaveBeenCalled();

      const updateArg = (prisma.notificationChannel.update as jest.Mock).mock.calls[0][0];
      expect(updateArg.data.configEncrypted).toBeUndefined();
    });
  });

  // ─── softDeleteChannel ────────────────────────────────────────────────────────

  describe('softDeleteChannel', () => {
    it('sets deletedAt and enabled:false, returns true', async () => {
      (prisma.notificationChannel.findFirst as jest.Mock).mockResolvedValue(makeChannel());
      (prisma.notificationChannel.update as jest.Mock).mockResolvedValue(
        makeChannel({ deletedAt: new Date(), enabled: false }),
      );

      const result = await svc.softDeleteChannel(USER_ID, CHANNEL_ID);

      expect(result).toBe(true);
      const updateArg = (prisma.notificationChannel.update as jest.Mock).mock.calls[0][0];
      expect(updateArg.where).toEqual({ id: CHANNEL_ID });
      expect(updateArg.data.deletedAt).toBeInstanceOf(Date);
      expect(updateArg.data.enabled).toBe(false);
    });

    it('throws NotFoundError when channel is not owned by user', async () => {
      (prisma.notificationChannel.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(svc.softDeleteChannel(USER_ID, 'missing')).rejects.toBeInstanceOf(NotFoundError);

      expect(prisma.notificationChannel.update).not.toHaveBeenCalled();
    });
  });

  // ─── testChannel ──────────────────────────────────────────────────────────────

  describe('testChannel', () => {
    it('throws NotFoundError when channel is not owned by user', async () => {
      (prisma.notificationChannel.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(svc.testChannel(USER_ID, 'missing')).rejects.toBeInstanceOf(NotFoundError);

      expect(prisma.notification.create).not.toHaveBeenCalled();
      expect(bus.publish).not.toHaveBeenCalled();
    });

    it('creates a Notification row and enqueues { notificationId }', async () => {
      (prisma.notificationChannel.findFirst as jest.Mock).mockResolvedValue(makeChannel());
      const notif = makeNotification();
      (prisma.notification.create as jest.Mock).mockResolvedValue(notif);

      const result = await svc.testChannel(USER_ID, CHANNEL_ID);

      // Notification created with expected shape
      const createArg = (prisma.notification.create as jest.Mock).mock.calls[0][0];
      expect(createArg.data).toEqual(
        expect.objectContaining({
          channelId: CHANNEL_ID,
          eventType: 'test',
          payload: expect.objectContaining({ engagementId: 'test' }),
        }),
      );

      // Queue job enqueued with notificationId
      expect(bus.publish).toHaveBeenCalledWith('security.notification.requested', notif.id, {
        notificationId: notif.id,
      });

      // Returns the notification row
      expect(result).toBe(notif);
    });

    it('marks the notification FAILED and rethrows when enqueue fails', async () => {
      (prisma.notificationChannel.findFirst as jest.Mock).mockResolvedValue(makeChannel());
      const notif = makeNotification();
      (prisma.notification.create as jest.Mock).mockResolvedValue(notif);
      (bus.publish as jest.Mock).mockRejectedValueOnce(new Error('redis-down'));
      (prisma.notification.update as jest.Mock).mockResolvedValue({});

      await expect(svc.testChannel(USER_ID, CHANNEL_ID)).rejects.toThrow('redis-down');

      expect(prisma.notification.update).toHaveBeenCalledWith({
        where: { id: notif.id },
        data: expect.objectContaining({
          deliveryStatus: DeliveryStatus.FAILED,
          errorMessage: expect.stringContaining('redis-down'),
        }),
      });
    });
  });

  // ─── listDeliveries ───────────────────────────────────────────────────────────

  describe('listDeliveries', () => {
    it('queries notifications scoped to channel ownership, latest 100', async () => {
      (prisma.notification.findMany as jest.Mock).mockResolvedValue([]);

      await svc.listDeliveries(USER_ID, CHANNEL_ID);

      expect(prisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            channelId: CHANNEL_ID,
            channel: { userId: USER_ID, deletedAt: null },
          },
          orderBy: { createdAt: 'desc' },
          take: 100,
        }),
      );
    });
  });
});
