import { Test, TestingModule } from '@nestjs/testing';
import type { Job } from 'bullmq';
import { DeliveryStatus } from '@prisma/client';

import { PrismaService } from '@autoscanner/database';
import { NotificationDispatcher } from '@autoscanner/notifications';

import { NotificationProcessor } from '../notification.processor';
import { SECRET_BOX } from '../notification-adapters.module';

// ---------------------------------------------------------------------------
// Helpers / mocks
// ---------------------------------------------------------------------------

const MOCK_CONFIG_JSON = JSON.stringify({ webhookUrl: 'https://hooks.example.com/x' });

const mockChannel = {
  id: 'ch-1',
  type: 'WEBHOOK' as const,
  configEncrypted: Buffer.from('encrypted'),
  enabled: true,
  deletedAt: null,
};

const mockNotification = {
  id: 'notif-1',
  channelId: 'ch-1',
  eventType: 'scan.completed',
  payload: { engagementId: 'eng-1', engagementName: 'Demo Engagement' },
  deliveryStatus: DeliveryStatus.PENDING,
  attemptCount: 0,
  channel: mockChannel,
};

function makeJob(notificationId = 'notif-1'): Job<{ notificationId: string }> {
  return { data: { notificationId } } as Job<{ notificationId: string }>;
}

// ---------------------------------------------------------------------------

describe('NotificationProcessor', () => {
  let processor: NotificationProcessor;
  let prisma: { notification: { findUnique: jest.Mock; update: jest.Mock } };
  let dispatcher: { dispatch: jest.Mock };
  let secretBox: { open: jest.Mock };

  beforeEach(async () => {
    prisma = {
      notification: {
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue(undefined),
      },
    };

    dispatcher = { dispatch: jest.fn().mockResolvedValue(undefined) };

    secretBox = { open: jest.fn().mockReturnValue(MOCK_CONFIG_JSON) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationProcessor,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationDispatcher, useValue: dispatcher },
        { provide: SECRET_BOX, useValue: secretBox },
      ],
    }).compile();

    processor = module.get(NotificationProcessor);
  });

  // -------------------------------------------------------------------------
  // (1) Happy path — dispatch called, status → SENT
  // -------------------------------------------------------------------------
  describe('happy path', () => {
    it('decrypts config and dispatches, then marks SENT', async () => {
      prisma.notification.findUnique.mockResolvedValue(mockNotification);

      await processor.process(makeJob());

      // SecretBox.open should have been called with the encrypted buffer
      expect(secretBox.open).toHaveBeenCalledWith(mockChannel.configEncrypted);

      // dispatcher.dispatch called with correct args
      expect(dispatcher.dispatch).toHaveBeenCalledWith(
        'WEBHOOK',
        { webhookUrl: 'https://hooks.example.com/x' },
        expect.objectContaining({ subject: expect.any(String), body: expect.any(String) }),
      );

      // Update called twice: attemptCount bump, then SENT
      const updateCalls = prisma.notification.update.mock.calls;
      expect(updateCalls.length).toBeGreaterThanOrEqual(2);

      const sentCall = updateCalls.find(
        (c: [{ where: unknown; data: { deliveryStatus?: string } }]) =>
          c[0].data.deliveryStatus === DeliveryStatus.SENT,
      );
      expect(sentCall).toBeDefined();
      expect(sentCall[0].data.sentAt).toBeInstanceOf(Date);
    });
  });

  // -------------------------------------------------------------------------
  // (2) Notification missing → no dispatch, handle gracefully (mark FAILED)
  // -------------------------------------------------------------------------
  describe('notification missing', () => {
    it('returns early without dispatching when notification not found', async () => {
      prisma.notification.findUnique.mockResolvedValue(null);

      await processor.process(makeJob('missing-id'));

      expect(dispatcher.dispatch).not.toHaveBeenCalled();
      // No update calls since notification doesn't exist
      expect(prisma.notification.update).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // (3) Channel disabled or deletedAt set → FAILED, dispatch NOT called
  // -------------------------------------------------------------------------
  describe('channel disabled', () => {
    it('marks FAILED and skips dispatch when channel.enabled is false', async () => {
      prisma.notification.findUnique.mockResolvedValue({
        ...mockNotification,
        channel: { ...mockChannel, enabled: false },
      });

      await processor.process(makeJob());

      expect(dispatcher.dispatch).not.toHaveBeenCalled();

      const failedCall = prisma.notification.update.mock.calls.find(
        (c: [{ data: { deliveryStatus?: string } }]) =>
          c[0].data.deliveryStatus === DeliveryStatus.FAILED,
      );
      expect(failedCall).toBeDefined();
    });

    it('marks FAILED and skips dispatch when channel.deletedAt is set', async () => {
      prisma.notification.findUnique.mockResolvedValue({
        ...mockNotification,
        channel: { ...mockChannel, deletedAt: new Date() },
      });

      await processor.process(makeJob());

      expect(dispatcher.dispatch).not.toHaveBeenCalled();

      const failedCall = prisma.notification.update.mock.calls.find(
        (c: [{ data: { deliveryStatus?: string } }]) =>
          c[0].data.deliveryStatus === DeliveryStatus.FAILED,
      );
      expect(failedCall).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // (4) dispatch throws → status FAILED + errorMessage + rethrow
  // -------------------------------------------------------------------------
  describe('dispatch failure', () => {
    it('marks FAILED with errorMessage and rethrows when dispatcher throws', async () => {
      prisma.notification.findUnique.mockResolvedValue(mockNotification);
      const dispatchError = new Error('Webhook unreachable');
      dispatcher.dispatch.mockRejectedValue(dispatchError);

      await expect(processor.process(makeJob())).rejects.toThrow('Webhook unreachable');

      const failedCall = prisma.notification.update.mock.calls.find(
        (c: [{ data: { deliveryStatus?: string; errorMessage?: string } }]) =>
          c[0].data.deliveryStatus === DeliveryStatus.FAILED,
      );
      expect(failedCall).toBeDefined();
      expect(failedCall[0].data.errorMessage).toContain('Webhook unreachable');
    });
  });
});
