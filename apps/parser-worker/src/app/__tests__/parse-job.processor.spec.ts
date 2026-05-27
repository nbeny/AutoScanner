import { Readable } from 'node:stream';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import type { PrismaService } from '@autoscanner/database';
import { HttpxJsonParser, ParserRegistry, SubfinderJsonParser } from '@autoscanner/parsers';
import { NmapXmlParser } from '@autoscanner/parsers';
import type { ParseJobPayload } from '@autoscanner/queues';
import type { ObjectStorage } from '@autoscanner/storage';

import { CorrelationService } from '../correlation.service';
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
  let correlation: CorrelationService;
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
        update: jest.fn(async ({ data, where }) => ({ id: where.id, ...data })),
      },
      technology: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(async ({ data }) => ({ id: `tech_${data.assetId}_${data.name}`, ...data })),
        update: jest.fn(async ({ data, where }) => ({ id: where.id, ...data })),
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
    registry.register(new HttpxJsonParser());

    correlation = new CorrelationService(prisma);
    // Default: merge is a no-op. Individual tests override.
    jest.spyOn(correlation, 'mergeSubdomains').mockResolvedValue({ merged: 0 });

    processor = new ParseJobProcessor(prisma, registry, storage, correlation);
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
      technologiesPersisted: 0,
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

  describe('correlation merge after persist', () => {
    it('invokes correlation.mergeSubdomains with the engagement id after persistence', async () => {
      await processor.process(job(payload));

      expect(correlation.mergeSubdomains).toHaveBeenCalledTimes(1);
      expect(correlation.mergeSubdomains).toHaveBeenCalledWith('eng_1');
    });

    it('does not rethrow when correlation.mergeSubdomains fails — persistence already succeeded', async () => {
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      (correlation.mergeSubdomains as jest.Mock).mockRejectedValueOnce(
        new Error('boom: unique violation'),
      );

      const result = await processor.process(job(payload));

      // Job still reports success since persistence completed.
      expect(result.assetsPersisted).toBeGreaterThan(0);
      // And the error is surfaced as a warning, not swallowed silently.
      expect(warn).toHaveBeenCalledWith(
        expect.stringMatching(/correlation failed for engagement eng_1.*boom: unique violation/),
      );
      warn.mockRestore();
    });
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

  describe('Technology + HTTP-field persistence (httpx-json)', () => {
    const HTTPX_JSONL = [
      JSON.stringify({
        url: 'https://www.hackerone.com',
        input: 'www.hackerone.com',
        title: 'HackerOne',
        webserver: 'cloudflare',
        status_code: 200,
        tech: ['Cloudflare', 'HSTS', 'Varnish'],
      }),
      JSON.stringify({
        url: 'https://api.hackerone.com',
        input: 'api.hackerone.com',
        title: 'HackerOne API',
        webserver: 'cloudflare',
        status_code: 200,
        tech: [],
      }),
      JSON.stringify({
        url: 'https://mta-sts.hackerone.com',
        input: 'mta-sts.hackerone.com',
        webserver: 'GitHub.com',
        status_code: 404,
      }),
      '',
    ].join('\n');

    const httpxPayload: ParseJobPayload = {
      scanJobId: 'job_3',
      rawOutputKey: 'eng_1/scan_3/job_3/httpx.jsonl',
      parserName: 'httpx-json',
      scannerName: 'httpx',
      target: 'hackerone.com',
      engagementId: 'eng_1',
    };

    beforeEach(() => {
      storage.getObject.mockResolvedValue({
        body: asStream(HTTPX_JSONL),
        contentLength: HTTPX_JSONL.length,
        contentType: 'application/x-ndjson',
      });
    });

    it('upserts three Technology rows for the SUBDOMAIN asset from httpx', async () => {
      const result = await processor.process(job(httpxPayload));

      // 3 techs come from www.hackerone.com (Cloudflare/HSTS/Varnish);
      // api has empty tech[] and mta-sts has no `tech` key — so total = 3.
      const techCreate = prisma.technology as unknown as { create: jest.Mock };
      expect(techCreate.create).toHaveBeenCalledTimes(3);

      // Each create must target the www.hackerone.com SUBDOMAIN Asset.
      const wwwAssetId = 'asset_www.hackerone.com';
      const createCalls = techCreate.create.mock.calls as Array<
        [{ data: { assetId: string; name: string; version: unknown; source: string } }]
      >;
      const names = createCalls.map(([arg]) => arg.data.name);
      expect(names).toEqual(expect.arrayContaining(['Cloudflare', 'HSTS', 'Varnish']));
      for (const [arg] of createCalls) {
        expect(arg.data.assetId).toBe(wwwAssetId);
        expect(arg.data.source).toBe('httpx');
        // version is undefined in httpx -tech-detect mode
        expect(arg.data.version).toBeUndefined();
      }

      // Never use prisma.technology.upsert — version is nullable so the unique
      // (assetId, name, version) compound key can't be used as an upsert key.
      expect((prisma.technology as unknown as { upsert?: jest.Mock }).upsert).toBeUndefined();

      expect(result.technologiesPersisted).toBe(3);
    });

    it('updates Subdomain HTTP fields (httpStatus/httpTitle/httpServer) inside the same $transaction', async () => {
      await processor.process(job(httpxPayload));

      const subdomainUpdate = prisma.subdomain as unknown as { update: jest.Mock };

      // www: status + title + server
      expect(subdomainUpdate.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'subdomain_www.hackerone.com' },
          data: expect.objectContaining({
            httpStatus: 200,
            httpTitle: 'HackerOne',
            httpServer: 'cloudflare',
          }),
        }),
      );

      // api: status + title + server (tech empty)
      expect(subdomainUpdate.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'subdomain_api.hackerone.com' },
          data: expect.objectContaining({
            httpStatus: 200,
            httpTitle: 'HackerOne API',
            httpServer: 'cloudflare',
          }),
        }),
      );

      // mta-sts: 404, no title, server only
      expect(subdomainUpdate.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'subdomain_mta-sts.hackerone.com' },
          data: expect.objectContaining({
            httpStatus: 404,
            httpServer: 'GitHub.com',
          }),
        }),
      );

      expect(subdomainUpdate.update).toHaveBeenCalledTimes(3);

      // Updates wrapped in $transaction (the mock passes prisma as tx).
      expect(prisma.$transaction as unknown as jest.Mock).toHaveBeenCalled();
    });

    it('does not double-create Technology rows when httpx output repeats for the same host', async () => {
      // Simulate an existing Technology row for (asset_www.hackerone.com, Cloudflare, null).
      (prisma.technology as unknown as { findFirst: jest.Mock }).findFirst.mockImplementation(
        async ({ where }) => {
          if (
            where.assetId === 'asset_www.hackerone.com' &&
            where.name === 'Cloudflare' &&
            where.version === null
          ) {
            return { id: 'existing_tech_cf' };
          }
          return null;
        },
      );

      await processor.process(job(httpxPayload));

      const techCreate = prisma.technology as unknown as { create: jest.Mock };
      const techUpdate = prisma.technology as unknown as { update: jest.Mock };

      // Cloudflare → update (lastSeenAt bump); HSTS + Varnish → create.
      expect(techCreate.create).toHaveBeenCalledTimes(2);
      const createdNames = (
        techCreate.create.mock.calls as Array<[{ data: { name: string } }]>
      ).map(([arg]) => arg.data.name);
      expect(createdNames).toEqual(expect.arrayContaining(['HSTS', 'Varnish']));
      expect(createdNames).not.toContain('Cloudflare');

      expect(techUpdate.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'existing_tech_cf' },
          data: expect.objectContaining({ lastSeenAt: expect.any(Date) }),
        }),
      );
    });
  });
});
