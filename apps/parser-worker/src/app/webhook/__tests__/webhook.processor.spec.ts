/**
 * TDD spec for WebhookProcessor (T4.3).
 *
 * Mocks: PrismaService (webhookEvent, engagement, scan, scanJob, asset),
 *        FindingPersister.
 * Does NOT mock canonicalize — it is a pure function imported directly.
 */
import type { WebhookJobPayload } from '@autoscanner/queues';
import type { PrismaService } from '@autoscanner/database';
import type { ConsumerRegistrar, MessageContext } from '@autoscanner/messaging';
import type { FindingPersister } from '../../persisters/finding-persister';
import { WebhookProcessor } from '../webhook.processor';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCtx(data: WebhookJobPayload): MessageContext<WebhookJobPayload> {
  return {
    id: 't',
    type: 'security.webhook.ingest.requested',
    key: data.webhookEventId,
    attempt: 1,
    payload: data,
  };
}

function makeRegistrar(): ConsumerRegistrar {
  return { register: jest.fn() } as unknown as ConsumerRegistrar;
}

/** asset-service now owns Asset rows; the webhook path resolves ids through it. */
function makeAssetClient(ids: Record<string, string> = {}) {
  return {
    parseBatch: jest.fn().mockResolvedValue({
      assetIdsByCanonicalValue: ids,
      assetsPersisted: Object.keys(ids).length,
      portsPersisted: 0,
      servicesPersisted: 0,
      technologiesPersisted: 0,
      observationsPersisted: 0,
    }),
    recomputeRisk: jest.fn().mockResolvedValue(undefined),
  };
}

// ---------------------------------------------------------------------------
// Mock factory
// ---------------------------------------------------------------------------

function defaultPrisma() {
  const scanCreate = jest.fn().mockResolvedValue({ id: 'scan-1' });
  const scanJobCreate = jest.fn().mockResolvedValue({ id: 'scanjob-1' });

  return {
    webhookEvent: {
      findUnique: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({}),
    },
    engagement: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'eng-1',
        ownerId: 'user-1',
      }),
    },
    scan: {
      create: scanCreate,
    },
    scanJob: {
      create: scanJobCreate,
    },
    asset: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest
        .fn()
        .mockImplementation(({ data }) =>
          Promise.resolve({ id: `asset-${data.canonicalValue}`, ...data }),
        ),
    },
  };
}

function buildFindingPersister(): jest.Mocked<FindingPersister> {
  return {
    upsert: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<FindingPersister>;
}

// ---------------------------------------------------------------------------
// Test 1 — happy path: generic payload with 2 findings
// ---------------------------------------------------------------------------

describe('WebhookProcessor – happy path (generic, 2 findings)', () => {
  let prisma: ReturnType<typeof defaultPrisma>;
  let findingPersister: jest.Mocked<FindingPersister>;
  let processor: WebhookProcessor;
  let assetClient: ReturnType<typeof makeAssetClient>;

  const webhookEventId = 'event-1';
  const engagementId = 'eng-1';

  const payload = {
    engagementId,
    findings: [
      {
        title: 'XSS',
        severity: 'HIGH',
        assetValue: 'app.example.com',
        location: 'https://app.example.com/x',
      },
      {
        title: 'Open Port',
        severity: 'LOW',
        assetValue: '10.0.0.5',
      },
    ],
  };

  beforeEach(() => {
    prisma = defaultPrisma();
    // Event exists
    prisma.webhookEvent.findUnique.mockResolvedValue({
      id: webhookEventId,
      source: 'generic',
      payload,
    });

    findingPersister = buildFindingPersister();
    assetClient = makeAssetClient({
      'app.example.com': 'asset-app.example.com',
      '10.0.0.5': 'asset-10.0.0.5',
      'host.example.com': 'asset-host.example.com',
    });
    processor = new WebhookProcessor(
      prisma as unknown as PrismaService,
      findingPersister,
      assetClient as never,
      makeRegistrar(),
    );
  });

  it('returns findingsPersisted = 2', async () => {
    const result = await processor.process(makeCtx({ webhookEventId }));
    expect(result).toEqual({ findingsPersisted: 2 });
  });

  it('creates one Scan with correct fields', async () => {
    await processor.process(makeCtx({ webhookEventId }));
    expect(prisma.scan.create).toHaveBeenCalledTimes(1);
    const createArg = prisma.scan.create.mock.calls[0][0];
    expect(createArg.data).toMatchObject({
      engagementId,
      createdById: 'user-1',
      status: 'COMPLETED',
      name: 'webhook:generic',
    });
    expect(createArg.data.completedAt).toBeInstanceOf(Date);
  });

  it('creates one ScanJob with correct fields', async () => {
    await processor.process(makeCtx({ webhookEventId }));
    expect(prisma.scanJob.create).toHaveBeenCalledTimes(1);
    const createArg = prisma.scanJob.create.mock.calls[0][0];
    expect(createArg.data).toMatchObject({
      scanId: 'scan-1',
      scannerName: 'webhook:generic',
      target: 'generic',
      status: 'COMPLETED',
    });
  });

  it('sends both assets to asset-service instead of writing them here', async () => {
    await processor.process(makeCtx({ webhookEventId }));

    // asset-service owns Asset rows now: this path must not touch them directly. That is
    // also what fixes the old orphan IP pivot (no IpAddress row was ever created here).
    expect(prisma.asset.create).not.toHaveBeenCalled();
    expect(prisma.asset.findFirst).not.toHaveBeenCalled();

    expect(assetClient.parseBatch).toHaveBeenCalledTimes(1);
    const req = assetClient.parseBatch.mock.calls[0][0];
    expect(req.assets.map((a: { type: string }) => a.type).sort()).toEqual(['DOMAIN', 'IP']);
    expect(req.assets.map((a: { value: string }) => a.value).sort()).toEqual([
      '10.0.0.5',
      'app.example.com',
    ]);
  });

  it('calls findingPersister.upsert twice with scanJobId and assetId', async () => {
    await processor.process(makeCtx({ webhookEventId }));
    expect(findingPersister.upsert).toHaveBeenCalledTimes(2);

    // Both calls use the scanJob id from prisma.scanJob.create result
    for (const call of findingPersister.upsert.mock.calls) {
      expect(call[0]).toBe('scanjob-1'); // scanJobId
      expect(typeof call[1]).toBe('string'); // assetId
    }
  });

  it('updates the WebhookEvent with processedAt and resultingScanId', async () => {
    await processor.process(makeCtx({ webhookEventId }));
    expect(prisma.webhookEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: webhookEventId },
        data: expect.objectContaining({
          processedAt: expect.any(Date),
          resultingScanId: 'scan-1',
        }),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Test 2 — bad payload (normalizer throws WebhookNormalizationError)
// ---------------------------------------------------------------------------

describe('WebhookProcessor – bad payload (normalizer throws)', () => {
  let prisma: ReturnType<typeof defaultPrisma>;
  let findingPersister: jest.Mocked<FindingPersister>;
  let processor: WebhookProcessor;
  let assetClient: ReturnType<typeof makeAssetClient>;

  const webhookEventId = 'event-bad';

  beforeEach(() => {
    prisma = defaultPrisma();
    // Event exists but has a malformed payload (missing engagementId)
    prisma.webhookEvent.findUnique.mockResolvedValue({
      id: webhookEventId,
      source: 'generic',
      payload: { findings: [] }, // no engagementId → normalizer will throw
    });

    findingPersister = buildFindingPersister();
    assetClient = makeAssetClient({
      'app.example.com': 'asset-app.example.com',
      '10.0.0.5': 'asset-10.0.0.5',
      'host.example.com': 'asset-host.example.com',
    });
    processor = new WebhookProcessor(
      prisma as unknown as PrismaService,
      findingPersister,
      assetClient as never,
      makeRegistrar(),
    );
  });

  it('does NOT throw', async () => {
    await expect(processor.process(makeCtx({ webhookEventId }))).resolves.not.toThrow();
  });

  it('sets errorMessage and processedAt on the event', async () => {
    await processor.process(makeCtx({ webhookEventId }));
    expect(prisma.webhookEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: webhookEventId },
        data: expect.objectContaining({
          errorMessage: expect.any(String),
          processedAt: expect.any(Date),
        }),
      }),
    );
  });

  it('does NOT create a Scan', async () => {
    await processor.process(makeCtx({ webhookEventId }));
    expect(prisma.scan.create).not.toHaveBeenCalled();
  });

  it('does NOT call findingPersister.upsert', async () => {
    await processor.process(makeCtx({ webhookEventId }));
    expect(findingPersister.upsert).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Test 3 — unknown engagement
// ---------------------------------------------------------------------------

describe('WebhookProcessor – unknown engagement', () => {
  let prisma: ReturnType<typeof defaultPrisma>;
  let findingPersister: jest.Mocked<FindingPersister>;
  let processor: WebhookProcessor;
  let assetClient: ReturnType<typeof makeAssetClient>;

  const webhookEventId = 'event-noeng';
  const payload = {
    engagementId: 'missing-eng',
    findings: [{ title: 'XSS', severity: 'HIGH', assetValue: 'app.example.com' }],
  };

  beforeEach(() => {
    prisma = defaultPrisma();
    prisma.webhookEvent.findUnique.mockResolvedValue({
      id: webhookEventId,
      source: 'generic',
      payload,
    });
    // Engagement does not exist
    prisma.engagement.findUnique.mockResolvedValue(null);

    findingPersister = buildFindingPersister();
    assetClient = makeAssetClient({
      'app.example.com': 'asset-app.example.com',
      '10.0.0.5': 'asset-10.0.0.5',
      'host.example.com': 'asset-host.example.com',
    });
    processor = new WebhookProcessor(
      prisma as unknown as PrismaService,
      findingPersister,
      assetClient as never,
      makeRegistrar(),
    );
  });

  it('does NOT throw', async () => {
    await expect(processor.process(makeCtx({ webhookEventId }))).resolves.not.toThrow();
  });

  it('sets errorMessage and processedAt on the event', async () => {
    await processor.process(makeCtx({ webhookEventId }));
    expect(prisma.webhookEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: webhookEventId },
        data: expect.objectContaining({
          errorMessage: expect.stringContaining('engagement'),
          processedAt: expect.any(Date),
        }),
      }),
    );
  });

  it('does NOT persist any findings', async () => {
    await processor.process(makeCtx({ webhookEventId }));
    expect(findingPersister.upsert).not.toHaveBeenCalled();
    expect(prisma.scan.create).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Test 4 — missing WebhookEvent (no-op)
// ---------------------------------------------------------------------------

describe('WebhookProcessor – missing WebhookEvent', () => {
  let prisma: ReturnType<typeof defaultPrisma>;
  let findingPersister: jest.Mocked<FindingPersister>;
  let processor: WebhookProcessor;
  let assetClient: ReturnType<typeof makeAssetClient>;

  beforeEach(() => {
    prisma = defaultPrisma();
    // findUnique returns null = event not found
    prisma.webhookEvent.findUnique.mockResolvedValue(null);

    findingPersister = buildFindingPersister();
    assetClient = makeAssetClient({
      'app.example.com': 'asset-app.example.com',
      '10.0.0.5': 'asset-10.0.0.5',
      'host.example.com': 'asset-host.example.com',
    });
    processor = new WebhookProcessor(
      prisma as unknown as PrismaService,
      findingPersister,
      assetClient as never,
      makeRegistrar(),
    );
  });

  it('does NOT throw', async () => {
    await expect(
      processor.process(makeCtx({ webhookEventId: 'ghost-event' })),
    ).resolves.not.toThrow();
  });

  it('returns findingsPersisted = 0', async () => {
    const result = await processor.process(makeCtx({ webhookEventId: 'ghost-event' }));
    expect(result).toEqual({ findingsPersisted: 0 });
  });

  it('does not touch the DB beyond the initial lookup', async () => {
    await processor.process(makeCtx({ webhookEventId: 'ghost-event' }));
    expect(prisma.webhookEvent.update).not.toHaveBeenCalled();
    expect(prisma.scan.create).not.toHaveBeenCalled();
    expect(findingPersister.upsert).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Test 5b — findings cap (>1000 findings → error, no scan created)
// ---------------------------------------------------------------------------

describe('WebhookProcessor – findings count cap (>1000)', () => {
  let prisma: ReturnType<typeof defaultPrisma>;
  let findingPersister: jest.Mocked<FindingPersister>;
  let processor: WebhookProcessor;
  let assetClient: ReturnType<typeof makeAssetClient>;

  const webhookEventId = 'event-cap';
  const engagementId = 'eng-1';

  // Build a generic payload with 1001 findings (each valid)
  const oversizedFindings = Array.from({ length: 1001 }, (_, i) => ({
    title: `Finding ${i}`,
    severity: 'LOW',
    assetValue: 'host.example.com',
  }));

  const payload = { engagementId, findings: oversizedFindings };

  beforeEach(() => {
    prisma = defaultPrisma();
    prisma.webhookEvent.findUnique.mockResolvedValue({
      id: webhookEventId,
      source: 'generic',
      payload,
    });

    findingPersister = buildFindingPersister();
    assetClient = makeAssetClient({
      'app.example.com': 'asset-app.example.com',
      '10.0.0.5': 'asset-10.0.0.5',
      'host.example.com': 'asset-host.example.com',
    });
    processor = new WebhookProcessor(
      prisma as unknown as PrismaService,
      findingPersister,
      assetClient as never,
      makeRegistrar(),
    );
  });

  it('returns findingsPersisted = 0', async () => {
    const result = await processor.process(makeCtx({ webhookEventId }));
    expect(result).toEqual({ findingsPersisted: 0 });
  });

  it('updates the event errorMessage with "too many findings" and sets processedAt', async () => {
    await processor.process(makeCtx({ webhookEventId }));
    expect(prisma.webhookEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: webhookEventId },
        data: expect.objectContaining({
          errorMessage: expect.stringContaining('too many findings'),
          processedAt: expect.any(Date),
        }),
      }),
    );
  });

  it('does NOT create a Scan', async () => {
    await processor.process(makeCtx({ webhookEventId }));
    expect(prisma.scan.create).not.toHaveBeenCalled();
  });

  it('does NOT call findingPersister.upsert', async () => {
    await processor.process(makeCtx({ webhookEventId }));
    expect(findingPersister.upsert).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Test 5 — asset already exists (findFirst returns a row → no create call)
// ---------------------------------------------------------------------------

describe('WebhookProcessor – asset already exists', () => {
  let prisma: ReturnType<typeof defaultPrisma>;
  let findingPersister: jest.Mocked<FindingPersister>;
  let processor: WebhookProcessor;
  let assetClient: ReturnType<typeof makeAssetClient>;

  const webhookEventId = 'event-exists';
  const engagementId = 'eng-1';

  const payload = {
    engagementId,
    findings: [{ title: 'XSS', severity: 'HIGH', assetValue: 'app.example.com' }],
  };

  beforeEach(() => {
    prisma = defaultPrisma();
    prisma.webhookEvent.findUnique.mockResolvedValue({
      id: webhookEventId,
      source: 'generic',
      payload,
    });
    // Whether the Asset already existed is asset-service's concern now; it simply answers
    // with the id, and this path must use it.
    prisma.asset.findFirst.mockResolvedValue({ id: 'existing-asset-id' });

    findingPersister = buildFindingPersister();
    assetClient = makeAssetClient({
      'app.example.com': 'asset-app.example.com',
      '10.0.0.5': 'asset-10.0.0.5',
      'host.example.com': 'asset-host.example.com',
    });
    processor = new WebhookProcessor(
      prisma as unknown as PrismaService,
      findingPersister,
      assetClient as never,
      makeRegistrar(),
    );
  });

  it('never creates assets locally — asset-service resolves them', async () => {
    await processor.process(makeCtx({ webhookEventId }));
    expect(prisma.asset.create).not.toHaveBeenCalled();
    expect(assetClient.parseBatch).toHaveBeenCalledTimes(1);
  });

  it('calls findingPersister.upsert with the id asset-service returned', async () => {
    await processor.process(makeCtx({ webhookEventId }));
    expect(findingPersister.upsert).toHaveBeenCalledTimes(1);
    expect(findingPersister.upsert.mock.calls[0][1]).toBe('asset-app.example.com');
  });
});
