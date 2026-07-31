import { Test } from '@nestjs/testing';
import { PrismaService } from '@autoscanner/database';
import { NvdClient } from '@autoscanner/cve';
import { ConsumerRegistrar, type MessageContext } from '@autoscanner/messaging';

import { NvdSyncProcessor } from '../nvd-sync.processor';
import type { NvdSyncPayload } from '@autoscanner/queues';

function ctx(payload: NvdSyncPayload): MessageContext<NvdSyncPayload> {
  return { id: 't', type: 'security.nvd.sync.requested', key: payload.mode, attempt: 1, payload };
}

describe('NvdSyncProcessor', () => {
  let processor: NvdSyncProcessor;
  let prisma: {
    nvdSyncState: {
      upsert: jest.Mock;
      update: jest.Mock;
    };
    nvdCve: { upsert: jest.Mock };
    nvdConfigNode: { deleteMany: jest.Mock; create: jest.Mock };
    $transaction: jest.Mock;
  };
  let nvd: { fetchCvePage: jest.Mock };

  beforeEach(async () => {
    prisma = {
      nvdSyncState: {
        upsert: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
      nvdCve: { upsert: jest.fn().mockResolvedValue({}) },
      nvdConfigNode: {
        deleteMany: jest.fn().mockResolvedValue({}),
        create: jest.fn().mockResolvedValue({}),
      },
      $transaction: jest.fn().mockImplementation((fn) => fn(prisma)),
    };

    nvd = { fetchCvePage: jest.fn().mockResolvedValue({ totalResults: 0, cves: [] }) };

    const module = await Test.createTestingModule({
      providers: [
        NvdSyncProcessor,
        { provide: PrismaService, useValue: prisma },
        { provide: NvdClient, useValue: nvd },
        { provide: ConsumerRegistrar, useValue: { register: jest.fn() } },
      ],
    }).compile();

    processor = module.get(NvdSyncProcessor);
  });

  it('full sync upserts each CVE and marks fullSyncCompletedAt', async () => {
    prisma.nvdSyncState.upsert.mockResolvedValue({
      id: 'singleton',
      fullSyncCompletedAt: null,
      lastStartIndex: 0,
      lastModEndDate: null,
    });
    nvd.fetchCvePage.mockResolvedValueOnce({
      totalResults: 1,
      cves: [
        {
          cveId: 'CVE-2024-1',
          cvssV3Score: 7.5,
          cvssV3Vector: 'AV:N',
          summary: 'd',
          publishedAt: new Date(),
          lastModified: new Date(),
          nodes: [
            {
              operator: 'OR',
              negate: false,
              cpeMatch: [
                {
                  vulnerable: true,
                  criteria: 'cpe:2.3:a:vendor:prod:1.0:*:*:*:*:*:*:*',
                },
              ],
            },
          ],
        },
      ],
    });
    await processor.process(ctx({ mode: 'full' }));
    expect(prisma.nvdCve.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { cveId: 'CVE-2024-1' } }),
    );
    expect(prisma.nvdConfigNode.create).toHaveBeenCalled();
    expect(prisma.nvdSyncState.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ fullSyncCompletedAt: expect.any(Date) }),
      }),
    );
  });

  it('parses cpeVendor/cpeProduct from the criteria', async () => {
    prisma.nvdSyncState.upsert.mockResolvedValue({
      id: 'singleton',
      fullSyncCompletedAt: null,
      lastStartIndex: 0,
      lastModEndDate: null,
    });
    nvd.fetchCvePage.mockResolvedValueOnce({
      totalResults: 1,
      cves: [
        {
          cveId: 'CVE-2024-2',
          cvssV3Score: null,
          cvssV3Vector: null,
          summary: null,
          publishedAt: null,
          lastModified: null,
          nodes: [
            {
              operator: 'OR',
              negate: false,
              cpeMatch: [
                {
                  vulnerable: true,
                  criteria: 'cpe:2.3:a:openssl:openssl:1.0.1:*:*:*:*:*:*:*',
                },
              ],
            },
          ],
        },
      ],
    });
    await processor.process(ctx({ mode: 'full' }));
    const nodeCreate = prisma.nvdConfigNode.create.mock.calls[0][0];
    const match = nodeCreate.data.matches.create[0];
    expect(match).toMatchObject({ cpeVendor: 'openssl', cpeProduct: 'openssl', vulnerable: true });
  });

  it('incremental sync queries the lastMod window and advances the cursor', async () => {
    prisma.nvdSyncState.upsert.mockResolvedValue({
      id: 'singleton',
      fullSyncCompletedAt: new Date(),
      lastModEndDate: new Date('2024-01-01T00:00:00Z'),
      lastStartIndex: 0,
    });
    nvd.fetchCvePage.mockResolvedValueOnce({ totalResults: 0, cves: [] });
    await processor.process(ctx({ mode: 'incremental' }));
    const call = nvd.fetchCvePage.mock.calls[0][0];
    expect(call.lastModStartDate).toBeDefined();
    expect(call.lastModEndDate).toBeDefined();
    expect(prisma.nvdSyncState.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ lastModEndDate: expect.any(Date) }),
      }),
    );
  });

  it('resumes a full sync from lastStartIndex', async () => {
    prisma.nvdSyncState.upsert.mockResolvedValue({
      id: 'singleton',
      fullSyncCompletedAt: null,
      lastStartIndex: 2000,
      lastModEndDate: null,
    });
    nvd.fetchCvePage.mockResolvedValueOnce({
      totalResults: 2001,
      cves: [
        {
          cveId: 'CVE-X',
          cvssV3Score: null,
          cvssV3Vector: null,
          summary: null,
          publishedAt: null,
          lastModified: null,
          nodes: [],
        },
      ],
    });
    await processor.process(ctx({ mode: 'full' }));
    expect(nvd.fetchCvePage.mock.calls[0][0].startIndex).toBe(2000);
  });
});
