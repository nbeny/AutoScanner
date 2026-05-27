import { Readable } from 'node:stream';
import type { Job } from 'bullmq';
import type { PrismaService } from '@autoscanner/database';
import { ParserRegistry, SubfinderJsonParser } from '@autoscanner/parsers';
import { NmapXmlParser } from '@autoscanner/parsers';
import type { ParseJobPayload } from '@autoscanner/queues';
import type { ObjectStorage } from '@autoscanner/storage';

import { ParseJobProcessor } from '../parse-job.processor';

const NMAP_XML = `<?xml version="1.0"?>
<nmaprun>
  <host>
    <status state="up"/>
    <address addr="10.0.0.5" addrtype="ipv4"/>
    <hostnames><hostname name="db.internal" type="user"/></hostnames>
    <ports>
      <port protocol="tcp" portid="22">
        <state state="open" reason="syn-ack"/>
        <service name="ssh" product="OpenSSH" version="9.0"/>
      </port>
      <port protocol="tcp" portid="5432">
        <state state="open" reason="syn-ack"/>
        <service name="postgresql" product="PostgreSQL" version="15"/>
      </port>
    </ports>
  </host>
</nmaprun>`;

function asStream(body: string): Readable {
  return Readable.from([Buffer.from(body, 'utf8')]);
}

describe('ParseJobProcessor', () => {
  let prisma: jest.Mocked<PrismaService>;
  let storage: jest.Mocked<ObjectStorage>;
  let registry: ParserRegistry;
  let processor: ParseJobProcessor;

  beforeEach(() => {
    prisma = {
      asset: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(async ({ data }) => ({ id: `asset_${data.canonicalValue}`, ...data })),
        update: jest.fn(async ({ data, where }) => ({ id: where.id, ...data })),
      },
      port: {
        upsert: jest.fn(async ({ create }) => ({
          id: `port_${create.number}_${create.protocol}`,
          ...create,
        })),
      },
      service: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(async ({ data }) => ({ id: `svc_${data.portId}`, ...data })),
        update: jest.fn(async ({ data, where }) => ({ id: where.id, ...data })),
      },
      finding: {
        upsert: jest.fn(async ({ create }) => ({ id: 'finding_1', ...create })),
      },
      scanJob: {
        update: jest.fn().mockResolvedValue({}),
      },
      domain: {
        upsert: jest.fn(async ({ create, where }) => ({
          id: `domain_${where.engagementId_canonicalValue.canonicalValue}`,
          ...create,
        })),
      },
      subdomain: {
        upsert: jest.fn(async ({ create, where }) => ({
          id: `subdomain_${where.engagementId_canonicalValue.canonicalValue}`,
          ...create,
        })),
      },
      $transaction: jest.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(prisma)),
    } as unknown as jest.Mocked<PrismaService>;

    storage = {
      ensureBucket: jest.fn(),
      putObject: jest.fn(),
      getObject: jest.fn().mockResolvedValue({
        body: asStream(NMAP_XML),
        contentLength: NMAP_XML.length,
        contentType: 'application/xml',
      }),
      headObject: jest.fn(),
      deleteObject: jest.fn(),
      presignGetUrl: jest.fn(),
      presignPutUrl: jest.fn(),
    } as unknown as jest.Mocked<ObjectStorage>;

    registry = new ParserRegistry();
    registry.register(new NmapXmlParser());
    registry.register(new SubfinderJsonParser());

    processor = new ParseJobProcessor(prisma, registry, storage);
  });

  const job = (payload: ParseJobPayload) =>
    ({
      id: 'bull_1',
      name: 'parse',
      data: payload,
      attemptsMade: 0,
    }) as unknown as Job<ParseJobPayload>;

  const payload: ParseJobPayload = {
    scanJobId: 'job_1',
    rawOutputKey: 'eng_1/scan_1/job_1/nmap-xml.xml',
    parserName: 'nmap-xml',
    scannerName: 'nmap',
    target: '10.0.0.5',
    engagementId: 'eng_1',
  };

  it('downloads raw output, parses, persists asset/ports/services', async () => {
    const result = await processor.process(job(payload));

    expect(storage.getObject).toHaveBeenCalledWith('raw-outputs', payload.rawOutputKey);

    // IP asset + DOMAIN asset created
    expect(prisma.asset.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          engagementId: 'eng_1',
          type: 'IP_ADDRESS',
          value: '10.0.0.5',
          canonicalValue: '10.0.0.5',
        }),
      }),
    );
    expect(prisma.asset.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'DOMAIN',
          value: 'db.internal',
          canonicalValue: 'db.internal',
        }),
      }),
    );

    // Both ports upserted
    expect(prisma.port.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          assetId_number_protocol: { assetId: 'asset_10.0.0.5', number: 22, protocol: 'TCP' },
        },
      }),
    );
    expect(prisma.port.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          assetId_number_protocol: { assetId: 'asset_10.0.0.5', number: 5432, protocol: 'TCP' },
        },
      }),
    );

    // Services created
    expect(prisma.service.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: 'ssh', product: 'OpenSSH', version: '9.0' }),
      }),
    );
    expect(prisma.service.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: 'postgresql', product: 'PostgreSQL' }),
      }),
    );

    expect(result).toEqual({
      assetsPersisted: 2,
      portsPersisted: 2,
      servicesPersisted: 2,
      findingsPersisted: 0,
    });
  });

  it('updates existing asset lastSeenAt instead of creating a duplicate', async () => {
    (prisma.asset.findFirst as jest.Mock).mockImplementation(async ({ where }) => {
      if (where.canonicalValue === '10.0.0.5') {
        return {
          id: 'existing_asset',
          type: 'IP_ADDRESS',
          value: '10.0.0.5',
          canonicalValue: '10.0.0.5',
        };
      }
      return null;
    });

    await processor.process(job(payload));

    expect(prisma.asset.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'existing_asset' },
        data: expect.objectContaining({ lastSeenAt: expect.any(Date) }),
      }),
    );
    // create still called for the DOMAIN asset
    expect(prisma.asset.create).toHaveBeenCalledTimes(1);
  });

  it('throws when parser not in registry (so BullMQ can retry/dead-letter)', async () => {
    await expect(
      processor.process(job({ ...payload, parserName: 'does-not-exist' })),
    ).rejects.toThrow(/does-not-exist/);

    expect(prisma.asset.create).not.toHaveBeenCalled();
  });

  it('throws when raw output is empty', async () => {
    storage.getObject.mockResolvedValueOnce({
      body: asStream(''),
      contentLength: 0,
      contentType: 'application/xml',
    });

    await expect(processor.process(job(payload))).rejects.toThrow(/empty/i);
  });

  describe('SUBDOMAIN persistence (subfinder-json)', () => {
    const SUBFINDER_JSONL = [
      '{"host":"www.hackerone.com","source":"crtsh"}',
      '{"host":"api.hackerone.com","source":"crtsh"}',
      '{"host":"hackerone.com","source":"shodan"}',
      '',
    ].join('\n');

    const subfinderPayload: ParseJobPayload = {
      scanJobId: 'job_2',
      rawOutputKey: 'eng_1/scan_2/job_2/subfinder.jsonl',
      parserName: 'subfinder-json',
      scannerName: 'subfinder',
      target: 'hackerone.com',
      engagementId: 'eng_1',
    };

    beforeEach(() => {
      storage.getObject.mockResolvedValue({
        body: asStream(SUBFINDER_JSONL),
        contentLength: SUBFINDER_JSONL.length,
        contentType: 'application/x-ndjson',
      });
    });

    it('upserts Domain, Subdomain, and Asset for each SUBDOMAIN normalized asset', async () => {
      const result = await processor.process(job(subfinderPayload));

      // Three subdomain hosts => three Subdomain upserts.
      expect((prisma.subdomain as unknown as { upsert: jest.Mock }).upsert).toHaveBeenCalledTimes(
        3,
      );
      expect((prisma.subdomain as unknown as { upsert: jest.Mock }).upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            engagementId_canonicalValue: {
              engagementId: 'eng_1',
              canonicalValue: 'www.hackerone.com',
            },
          },
        }),
      );

      // Domain upserts: parent = hackerone.com for `www.hackerone.com` and `api.hackerone.com`
      // (everything after first dot); apex `hackerone.com` => parent = itself (1-dot host).
      const domainUpsert = prisma.domain as unknown as { upsert: jest.Mock };
      const calls = domainUpsert.upsert.mock.calls.map(
        (c: [{ where: { engagementId_canonicalValue: { canonicalValue: string } } }]) =>
          c[0].where.engagementId_canonicalValue.canonicalValue,
      );
      // All three subdomains resolve to parent domain `hackerone.com`.
      expect(calls).toEqual(['hackerone.com', 'hackerone.com', 'hackerone.com']);

      // Asset must be created with type='SUBDOMAIN' and subdomainId set (CHECK constraint).
      expect(prisma.asset.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            engagementId: 'eng_1',
            type: 'SUBDOMAIN',
            value: 'www.hackerone.com',
            canonicalValue: 'www.hackerone.com',
            subdomainId: 'subdomain_www.hackerone.com',
          }),
        }),
      );
      // Polymorphic FKs we do not own must not be set on a SUBDOMAIN Asset.
      const createCalls = (prisma.asset.create as jest.Mock).mock.calls as Array<
        [{ data: Record<string, unknown> }]
      >;
      for (const [arg] of createCalls) {
        if (arg.data.type === 'SUBDOMAIN') {
          expect(arg.data.domainId).toBeUndefined();
          expect(arg.data.ipAddressId).toBeUndefined();
        }
      }

      // Wrapped in $transaction.
      expect(prisma.$transaction as unknown as jest.Mock).toHaveBeenCalled();

      expect(result.assetsPersisted).toBe(3);
    });

    it('derives parent domain correctly: ≥2 dots → after first dot; 1 dot → host itself', async () => {
      await processor.process(job(subfinderPayload));

      const domainUpsert = prisma.domain as unknown as { upsert: jest.Mock };
      const calls = domainUpsert.upsert.mock.calls.map(
        (c: [{ create: { canonicalValue: string }; where: unknown }]) => c[0].create.canonicalValue,
      );
      // For sub.foo.example.com → foo.example.com pattern (here all hosts in *.hackerone.com).
      expect(calls).toContain('hackerone.com');
      // Apex (hackerone.com → hackerone.com) must NOT erroneously produce just `com`.
      expect(calls).not.toContain('com');
    });

    it('updates existing Asset row instead of creating a new one for repeat subdomains', async () => {
      (prisma.asset.findFirst as jest.Mock).mockImplementation(async ({ where }) => {
        if (where.canonicalValue === 'www.hackerone.com' && where.type === 'SUBDOMAIN') {
          return { id: 'existing_sub_asset', subdomainId: 'subdomain_www.hackerone.com' };
        }
        return null;
      });

      await processor.process(job(subfinderPayload));

      expect(prisma.asset.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'existing_sub_asset' },
          data: expect.objectContaining({ lastSeenAt: expect.any(Date) }),
        }),
      );
    });
  });
});
