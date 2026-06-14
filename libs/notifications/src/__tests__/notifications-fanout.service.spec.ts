import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { NotificationsFanoutService } from '../notifications-fanout.service';
import { PrismaService } from '@autoscanner/database';
import { QueueName } from '@autoscanner/queues';
import { NotificationEventType } from '../event-types';

const mockEngagement = { ownerId: 'user-1', name: 'Acme Corp' };
const mockChannels = [{ id: 'ch-1' }, { id: 'ch-2' }];
const mockNotification = { id: 'notif-1' };

const makePrismaMock = () => ({
  engagement: {
    findUnique: jest.fn(),
  },
  notificationChannel: {
    findMany: jest.fn(),
  },
  notification: {
    create: jest.fn(),
  },
});

const makeQueueMock = () => ({
  add: jest.fn().mockResolvedValue(undefined),
});

describe('NotificationsFanoutService', () => {
  let service: NotificationsFanoutService;
  let prisma: ReturnType<typeof makePrismaMock>;
  let queue: ReturnType<typeof makeQueueMock>;

  beforeEach(async () => {
    prisma = makePrismaMock();
    queue = makeQueueMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsFanoutService,
        { provide: PrismaService, useValue: prisma },
        { provide: getQueueToken(QueueName.NOTIFICATION_JOBS), useValue: queue },
      ],
    }).compile();

    service = module.get<NotificationsFanoutService>(NotificationsFanoutService);
  });

  it('returns 0 when engagement not found', async () => {
    prisma.engagement.findUnique.mockResolvedValue(null);
    const result = await service.fanout(NotificationEventType.SCAN_COMPLETED, {
      engagementId: 'eng-999',
    });
    expect(result).toBe(0);
    expect(prisma.notification.create).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('returns 0 when no matching channels', async () => {
    prisma.engagement.findUnique.mockResolvedValue(mockEngagement);
    prisma.notificationChannel.findMany.mockResolvedValue([]);
    const result = await service.fanout(NotificationEventType.SCAN_COMPLETED, {
      engagementId: 'eng-1',
    });
    expect(result).toBe(0);
    expect(prisma.notification.create).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('creates 2 notification rows and enqueues 2 jobs for 2 matching channels', async () => {
    prisma.engagement.findUnique.mockResolvedValue(mockEngagement);
    prisma.notificationChannel.findMany.mockResolvedValue(mockChannels);
    prisma.notification.create.mockResolvedValue(mockNotification);

    const result = await service.fanout(NotificationEventType.SCAN_COMPLETED, {
      engagementId: 'eng-1',
    });

    expect(result).toBe(2);
    expect(prisma.notification.create).toHaveBeenCalledTimes(2);
    expect(queue.add).toHaveBeenCalledTimes(2);
    expect(queue.add).toHaveBeenCalledWith('notify', { notificationId: 'notif-1' });
  });

  it('queries channels with eventFilters { has: eventType }', async () => {
    prisma.engagement.findUnique.mockResolvedValue(mockEngagement);
    prisma.notificationChannel.findMany.mockResolvedValue([]);

    await service.fanout(NotificationEventType.SCAN_COMPLETED, { engagementId: 'eng-1' });

    expect(prisma.notificationChannel.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          eventFilters: { has: NotificationEventType.SCAN_COMPLETED },
        }),
      }),
    );
  });

  it('swallows enqueue errors but still counts created notifications', async () => {
    prisma.engagement.findUnique.mockResolvedValue(mockEngagement);
    prisma.notificationChannel.findMany.mockResolvedValue([{ id: 'ch-1' }]);
    prisma.notification.create.mockResolvedValue(mockNotification);
    queue.add.mockRejectedValue(new Error('queue down'));

    // Should not throw; row still created, enqueued count = 0
    const result = await service.fanout(NotificationEventType.SCAN_COMPLETED, {
      engagementId: 'eng-1',
    });

    expect(result).toBe(0);
    expect(prisma.notification.create).toHaveBeenCalledTimes(1);
  });

  it('enriches payload with engagement name when not provided', async () => {
    prisma.engagement.findUnique.mockResolvedValue(mockEngagement);
    prisma.notificationChannel.findMany.mockResolvedValue([{ id: 'ch-1' }]);
    prisma.notification.create.mockResolvedValue(mockNotification);

    await service.fanout(NotificationEventType.SCAN_COMPLETED, { engagementId: 'eng-1' });

    expect(prisma.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          payload: expect.objectContaining({ engagementName: 'Acme Corp' }),
        }),
      }),
    );
  });
});
