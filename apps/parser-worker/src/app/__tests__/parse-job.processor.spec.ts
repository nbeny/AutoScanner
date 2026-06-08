import { Readable } from 'node:stream';
import { Logger } from '@nestjs/common';
import type { Job, Queue } from 'bullmq';
import type { PrismaService } from '@autoscanner/database';
import {
  DnsxJsonParser,
  HttpxJsonParser,
  NucleiJsonParser,
  ParserRegistry,
  SubfinderJsonParser,
} from '@autoscanner/parsers';
import { NmapXmlParser } from '@autoscanner/parsers';
import type { CveEnrichmentPayload, ParseJobPayload } from '@autoscanner/queues';
import type { ObjectStorage } from '@autoscanner/storage';
import {
  EngagementUpdateKind,
  type EngagementEventsPublisher,
} from '@autoscanner/engagement-events';

import { AssetMergeService } from '@autoscanner/correlation';

import { ParseJobProcessor } from '../parse-job.processor';
import { AssetPersister } from '../persisters/asset-persister';
import { DnsRecordPersister } from '../persisters/dns-record-persister';
import { FindingPersister } from '../persisters/finding-persister';
import { IpAddressPersister } from '../persisters/ip-address-persister';
import { PortPersister } from '../persisters/port-persister';
import { ServicePersister } from '../persisters/service-persister';
import { SubdomainIpPersister } from '../persisters/subdomain-ip-persister';
import { TechnologyPersister } from '../persisters/technology-persister';

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
  let assetMerge: AssetMergeService;
  let cveQueueMock: jest.Mocked<Pick<Queue<CveEnrichmentPayload>, 'add'>>;
  let eventsMock: jest.Mocked<EngagementEventsPublisher>;
  let processor: ParseJobProcessor;

  beforeEach(() => {
    prisma = {
      asset: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue({ id: 'asset_mock', findings: [], ports: [] }),
        create: jest.fn(async ({ data }) => ({ id: `asset_${data.canonicalValue}`, ...data })),
        update: jest.fn(async ({ data, where }) => ({ id: where.id, ...data })),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      port: {
        upsert: jest.fn(async ({ create }) => ({
          id: `port_${create.number}_${create.protocol}`,
          ...create,
        })),
        findUnique: jest.fn().mockResolvedValue({ assetId: 'asset_10.0.0.5' }),
      },
      service: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(async ({ data }) => ({ id: `svc_${data.portId}`, ...data })),
        update: jest.fn(async ({ data, where }) => ({ id: where.id, ...data })),
      },
      finding: {
        upsert: jest.fn(async ({ create }) => ({ id: 'finding_1', ...create })),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      scanJob: {
        update: jest.fn().mockResolvedValue({}),
      },
      domain: {
        upsert: jest.fn(async ({ create, where }) => ({
          id: `domain_${where.engagementId_canonicalValue.canonicalValue}`,
          ...create,
        })),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      subdomain: {
        upsert: jest.fn(async ({ create, where }) => ({
          id: `subdomain_${where.engagementId_canonicalValue.canonicalValue}`,
          ...create,
        })),
        update: jest.fn(async ({ data, where }) => ({ id: where.id, ...data })),
        findFirst: jest.fn().mockResolvedValue(null),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      technology: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(async ({ data }) => ({ id: `tech_${data.assetId}_${data.name}`, ...data })),
        update: jest.fn(async ({ data, where }) => ({ id: where.id, ...data })),
      },
      ipAddress: {
        upsert: jest.fn(async ({ create, where }) => ({
          id: `ip_${where.engagementId_canonicalValue.canonicalValue}`,
          ...create,
        })),
        findFirst: jest.fn().mockResolvedValue(null),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      dnsRecord: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(async ({ data }) => ({
          id: `dns_${data.name}_${data.type}_${data.value}`,
          ...data,
        })),
        update: jest.fn(async ({ data, where }) => ({ id: where.id, ...data })),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      subdomainIp: {
        upsert: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      assetObservation: {
        create: jest.fn().mockResolvedValue({ id: 'obs_mock' }),
      },
      $transaction: jest.fn(async (cb: (tx: unknown) => Promise<unknown> | unknown[]) => {
        if (typeof cb === 'function') return cb(prisma);
        // Array form: execute each operation
        return Promise.all(cb as unknown[]);
      }),
      $queryRaw: jest.fn().mockResolvedValue([]),
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
    registry.register(new DnsxJsonParser());
    registry.register(new NucleiJsonParser());

    assetMerge = new AssetMergeService(prisma);
    // Default: merges are no-ops. Individual tests override.
    jest.spyOn(assetMerge, 'mergeSubdomains').mockResolvedValue({ merged: 0 });
    jest.spyOn(assetMerge, 'mergeIpAddresses').mockResolvedValue({ merged: 0 });
    jest.spyOn(assetMerge, 'dedupFindings').mockResolvedValue({ merged: 0 });

    cveQueueMock = { add: jest.fn().mockResolvedValue({}) };
    eventsMock = { publish: jest.fn().mockResolvedValue(undefined) };

    processor = new ParseJobProcessor(
      registry,
      storage,
      assetMerge,
      new AssetPersister(prisma),
      new PortPersister(prisma),
      new ServicePersister(prisma),
      new TechnologyPersister(prisma),
      new FindingPersister(prisma),
      new IpAddressPersister(prisma),
      new DnsRecordPersister(prisma),
      new SubdomainIpPersister(prisma),
      prisma,
      cveQueueMock as unknown as Queue<CveEnrichmentPayload>,
      eventsMock,
    );
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
      assetsPersisted: 1,
      portsPersisted: 2,
      servicesPersisted: 2,
      findingsPersisted: 0,
      technologiesPersisted: 0,
      ipAddressesPersisted: 1,
      dnsRecordsPersisted: 0,
      subdomainIpsPersisted: 0,
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

  it('retries non-SUBDOMAIN upsert on P2002 race and updates the winning row', async () => {
    // Simulate a concurrent-worker race on the DOMAIN asset 'db.internal' (the
    // path that goes through AssetPersister.upsert — IPs are owned by
    // IpAddressPersister). 1st create throws P2002, the retried transaction's
    // findFirst returns the row inserted by the racing worker, and we take
    // the update branch instead of re-creating.
    const p2002 = Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
    let domainFindFirstCalls = 0;
    let domainCreateCalls = 0;

    (prisma.asset.findFirst as jest.Mock).mockImplementation(async ({ where }) => {
      if (where.canonicalValue === 'db.internal' && where.type === 'DOMAIN') {
        domainFindFirstCalls++;
        if (domainFindFirstCalls === 1) return null;
        return {
          id: 'winner_domain',
          type: 'DOMAIN',
          value: 'db.internal',
          canonicalValue: 'db.internal',
        };
      }
      return null;
    });
    (prisma.asset.create as jest.Mock).mockImplementation(async ({ data }) => {
      if (data.canonicalValue === 'db.internal' && data.type === 'DOMAIN') {
        domainCreateCalls++;
        if (domainCreateCalls === 1) throw p2002;
      }
      return { id: `asset_${data.canonicalValue}`, ...data };
    });

    await processor.process(job(payload));

    expect(domainFindFirstCalls).toBe(2);
    // Only the failed first create; the retry hits the winner and takes update.
    expect(domainCreateCalls).toBe(1);
    expect(prisma.asset.update).toHaveBeenCalledWith({
      where: { id: 'winner_domain' },
      data: { lastSeenAt: expect.any(Date) },
    });
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

  it('refuses to load an oversize raw output into memory (caps memory blast radius)', async () => {
    // A scanner producing > MAX_RAW_OUTPUT_BYTES (e.g. naabu on a /16 or a
    // runaway nuclei job) must fail the parse job with a clear error rather
    // than OOM the worker. We stream chunks that exceed the cap in one go
    // so the early bail-out fires on the first oversized chunk.
    const { MAX_RAW_OUTPUT_BYTES } = await import('../parse-job.processor');
    const bigChunk = Buffer.alloc(MAX_RAW_OUTPUT_BYTES + 1, 0x20);
    storage.getObject.mockResolvedValueOnce({
      body: Readable.from([bigChunk]),
      contentLength: bigChunk.length,
      contentType: 'application/xml',
    });

    await expect(processor.process(job(payload))).rejects.toThrow(/raw output exceeds .* bytes/);
    // The parser must never be invoked — proves the cap fires before we
    // attempt to parse the oversized buffer.
    expect(prisma.asset.create).not.toHaveBeenCalled();
  });

  describe('correlation merge after persist', () => {
    it('invokes assetMerge.mergeSubdomains with the engagement id after persistence', async () => {
      await processor.process(job(payload));

      expect(assetMerge.mergeSubdomains).toHaveBeenCalledTimes(1);
      expect(assetMerge.mergeSubdomains).toHaveBeenCalledWith('eng_1');
    });

    it('does not rethrow when assetMerge.mergeSubdomains fails — persistence already succeeded', async () => {
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      (assetMerge.mergeSubdomains as jest.Mock).mockRejectedValueOnce(
        new Error('boom: unique violation'),
      );

      const result = await processor.process(job(payload));

      // Job still reports success since persistence completed.
      expect(result.assetsPersisted).toBeGreaterThan(0);
      // And the error is surfaced as a warning, not swallowed silently.
      expect(warn).toHaveBeenCalledWith(
        expect.stringMatching(/correlation pass \(subdomains\) failed.*boom: unique violation/),
        expect.any(String),
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
            return { id: 'existing_tech_cf', categories: [] };
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

    it('union-merges Technology categories on re-detection and never rewrites source', async () => {
      // Pre-existing Cloudflare row was first detected by another scanner with
      // categories ['cdn']. httpx now re-detects it carrying ['waf']. We expect
      // the update to write ['cdn','waf'] (order-preserving union), and we
      // expect `source` to be absent from the update payload — sticky.
      (prisma.technology as unknown as { findFirst: jest.Mock }).findFirst.mockImplementation(
        async ({ where }) => {
          if (
            where.assetId === 'asset_www.hackerone.com' &&
            where.name === 'Cloudflare' &&
            where.version === null
          ) {
            return { id: 'existing_tech_cf', categories: ['cdn'] };
          }
          return null;
        },
      );

      // Simulate the parser carrying categories for Cloudflare. Inject via a
      // ParserRegistry override that mirrors the httpx payload but adds a
      // categories field to the Cloudflare tech entry.
      const techUpdate = prisma.technology as unknown as { update: jest.Mock };

      // Re-route the httpx parser to emit a tech with categories.
      jest.spyOn(registry, 'get').mockReturnValue({
        parse: async () => ({
          assets: [
            {
              type: 'SUBDOMAIN' as const,
              value: 'www.hackerone.com',
              parentDomain: 'hackerone.com',
            },
          ],
          ports: [],
          services: [],
          findings: [],
          technologies: [
            {
              assetValue: 'www.hackerone.com',
              name: 'Cloudflare',
              categories: ['waf'],
            },
          ],
          ipAddresses: [],
          dnsRecords: [],
          subdomainIps: [],
          httpProbes: [],
        }),
      } as never);

      await processor.process(job(httpxPayload));

      const updateCalls = techUpdate.update.mock.calls as Array<
        [{ data: { categories?: string[]; source?: string } }]
      >;
      const cfUpdate = updateCalls.find(([arg]) => Array.isArray(arg.data.categories));
      expect(cfUpdate).toBeDefined();
      expect(cfUpdate?.[0].data.categories).toEqual(['cdn', 'waf']);
      // `source` is sticky — never set on update.
      expect(cfUpdate?.[0].data.source).toBeUndefined();
    });
  });

  describe('DNS persistence (dnsx-json)', () => {
    const DNSX_JSONL = [
      JSON.stringify({
        host: 'www.hackerone.com',
        a: ['104.16.99.52', '104.16.100.52'],
        aaaa: ['2606:4700::6810:6334'],
        cname: ['www.hackerone.com.cdn.cloudflare.net'],
      }),
      JSON.stringify({
        host: 'api.hackerone.com',
        a: ['104.16.99.52'],
      }),
      JSON.stringify({
        host: 'smtp.hackerone.com',
        mx: ['smtp.hackerone.com'],
      }),
      '',
    ].join('\n');

    const dnsxPayload: ParseJobPayload = {
      scanJobId: 'job_4',
      rawOutputKey: 'eng_1/scan_4/job_4/dnsx.jsonl',
      parserName: 'dnsx-json',
      scannerName: 'dnsx',
      target: 'hackerone.com',
      engagementId: 'eng_1',
    };

    beforeEach(() => {
      storage.getObject.mockResolvedValue({
        body: asStream(DNSX_JSONL),
        contentLength: DNSX_JSONL.length,
        contentType: 'application/x-ndjson',
      });

      // Simulate Subdomains existing for www and api (dnsx runs after subfinder).
      (prisma.subdomain as unknown as { findFirst: jest.Mock }).findFirst.mockImplementation(
        async ({ where }: { where: { canonicalValue?: string } }) => {
          if (where.canonicalValue === 'www.hackerone.com') {
            return { id: 'subdomain_www.hackerone.com', domainId: 'domain_hackerone.com' };
          }
          if (where.canonicalValue === 'api.hackerone.com') {
            return { id: 'subdomain_api.hackerone.com', domainId: 'domain_hackerone.com' };
          }
          if (where.canonicalValue === 'smtp.hackerone.com') {
            return { id: 'subdomain_smtp.hackerone.com', domainId: 'domain_hackerone.com' };
          }
          return null;
        },
      );

      // Simulate IpAddress rows being found after upsert (for SubdomainIp join lookup).
      (prisma.ipAddress as unknown as { findFirst: jest.Mock }).findFirst.mockImplementation(
        async ({ where }: { where: { canonicalValue?: string } }) => {
          if (where.canonicalValue) {
            return { id: `ip_${where.canonicalValue}` };
          }
          return null;
        },
      );
    });

    it('upserts IpAddress rows with correct version for A (IPV4) and AAAA (IPV6) records', async () => {
      await processor.process(job(dnsxPayload));

      const ipUpsert = prisma.ipAddress as unknown as { upsert: jest.Mock };

      // www: 2×A + 1×AAAA = 3; api: 1×A = 1 → total 4 IpAddress upserts.
      expect(ipUpsert.upsert).toHaveBeenCalledTimes(4);

      // IPV4 for an A record.
      expect(ipUpsert.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            value: '104.16.99.52',
            canonicalValue: '104.16.99.52',
            version: 'IPV4',
          }),
        }),
      );

      // IPV6 for an AAAA record.
      expect(ipUpsert.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            value: '2606:4700::6810:6334',
            canonicalValue: '2606:4700::6810:6334',
            version: 'IPV6',
          }),
        }),
      );
    });

    it('creates Asset rows with type IP_ADDRESS and ipAddressId set', async () => {
      await processor.process(job(dnsxPayload));

      // Asset.create for each IP (within $transaction which uses prisma as tx).
      expect(prisma.asset.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'IP_ADDRESS',
            canonicalValue: '104.16.99.52',
            ipAddressId: 'ip_104.16.99.52',
          }),
        }),
      );

      // Ensure ipAddressId is set — CHECK constraint in DB requires this.
      const createCalls = (prisma.asset.create as jest.Mock).mock.calls as Array<
        [{ data: Record<string, unknown> }]
      >;
      for (const [arg] of createCalls) {
        if (arg.data.type === 'IP_ADDRESS') {
          expect(arg.data.ipAddressId).toBeDefined();
        }
      }
    });

    it('creates DnsRecord rows for each record type', async () => {
      await processor.process(job(dnsxPayload));

      // www: 2×A + 1×AAAA + 1×CNAME = 4; api: 1×A = 1; smtp: 1×MX = 1 → total 6.
      const dnsCreate = prisma.dnsRecord as unknown as { create: jest.Mock };
      expect(dnsCreate.create).toHaveBeenCalledTimes(6);

      // Check one A record.
      expect(dnsCreate.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'A',
            name: 'www.hackerone.com',
            value: '104.16.99.52',
          }),
        }),
      );

      // Check the CNAME record.
      expect(dnsCreate.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'CNAME',
            name: 'www.hackerone.com',
            value: 'www.hackerone.com.cdn.cloudflare.net',
          }),
        }),
      );

      // Check the MX record.
      expect(dnsCreate.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'MX',
            name: 'smtp.hackerone.com',
            value: 'smtp.hackerone.com',
          }),
        }),
      );
    });

    it('creates SubdomainIp join rows for A/AAAA records where host is a known Subdomain', async () => {
      await processor.process(job(dnsxPayload));

      const subdomainIpUpsert = prisma.subdomainIp as unknown as { upsert: jest.Mock };

      // www: 2×A + 1×AAAA = 3 joins; api: 1×A = 1 join; smtp has no A/AAAA → 0.
      // total: 4 SubdomainIp upserts.
      expect(subdomainIpUpsert.upsert).toHaveBeenCalledTimes(4);

      expect(subdomainIpUpsert.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            subdomainId_ipAddressId: {
              subdomainId: 'subdomain_www.hackerone.com',
              ipAddressId: 'ip_104.16.99.52',
            },
          },
        }),
      );
    });

    it('returns correct result counts', async () => {
      const result = await processor.process(job(dnsxPayload));

      // No SUBDOMAIN assets emitted by dnsx parser → assetsPersisted = 0.
      expect(result.assetsPersisted).toBe(0);
      // 4 unique IPs (104.16.99.52 appears twice but deduplication is a DB concern;
      // parser emits it twice so persister is called twice → 4 persisted).
      expect(result.ipAddressesPersisted).toBe(4);
      // www: 4 + api: 1 + smtp: 1 = 6
      expect(result.dnsRecordsPersisted).toBe(6);
      // www: 3 + api: 1 = 4
      expect(result.subdomainIpsPersisted).toBe(4);
    });

    it('skips SubdomainIp join when host has no matching Subdomain in DB', async () => {
      // Only smtp.hackerone.com is known (and smtp has only MX, no A/AAAA).
      (prisma.subdomain as unknown as { findFirst: jest.Mock }).findFirst.mockResolvedValue(null);

      await processor.process(job(dnsxPayload));

      const subdomainIpUpsert = prisma.subdomainIp as unknown as { upsert: jest.Mock };
      expect(subdomainIpUpsert.upsert).not.toHaveBeenCalled();
    });

    it('calls assetMerge.mergeIpAddresses after persistence', async () => {
      await processor.process(job(dnsxPayload));

      expect(assetMerge.mergeIpAddresses).toHaveBeenCalledTimes(1);
      expect(assetMerge.mergeIpAddresses).toHaveBeenCalledWith('eng_1');
    });

    it('promotes a legacy subdomainId:null DnsRecord row when the subdomain is now known', async () => {
      // Scenario: a prior dnsx run landed before subfinder created the
      // Subdomain row, so the record was stored as
      // `{domainId:'d1', subdomainId:null, type:'A', name:'www…', value:'…'}`.
      // Today subfinder has filled in the Subdomain and dnsx runs again.
      // The OR-clause must find the legacy row and *promote* it (set
      // subdomainId) rather than create a duplicate.
      jest.spyOn(registry, 'get').mockReturnValue({
        parse: async () => ({
          assets: [],
          ports: [],
          services: [],
          findings: [],
          technologies: [],
          ipAddresses: [],
          dnsRecords: [
            {
              assetValue: 'www.hackerone.com',
              recordType: 'A',
              value: '104.16.99.52',
            },
          ],
          subdomainIps: [],
          httpProbes: [],
        }),
      } as never);

      const dnsRecordMock = prisma.dnsRecord as unknown as {
        findFirst: jest.Mock;
        update: jest.Mock;
        create: jest.Mock;
      };
      // Pretend the legacy orphan row exists.
      dnsRecordMock.findFirst.mockResolvedValueOnce({
        id: 'legacy_dnsrecord_id',
        subdomainId: null,
      });

      await processor.process(job(dnsxPayload));

      // Update should have been called with the promoted subdomainId.
      expect(dnsRecordMock.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'legacy_dnsrecord_id' },
          data: expect.objectContaining({
            subdomainId: 'subdomain_www.hackerone.com',
          }),
        }),
      );
      // And no extra create for this record.
      expect(dnsRecordMock.create).not.toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ name: 'www.hackerone.com', value: '104.16.99.52' }),
        }),
      );
    });

    it('preserves case for TXT/CAA values and canonicalises AAAA via RFC 5952', async () => {
      // dnsx-json today doesn't emit TXT/CAA/AAAA-with-mixed-case, but the
      // persister advertises support for those types. Inject a synthetic
      // parser output to verify the persister's value-normalisation contract
      // without depending on a real fixture.
      jest.spyOn(registry, 'get').mockReturnValue({
        parse: async () => ({
          assets: [],
          ports: [],
          services: [],
          findings: [],
          technologies: [],
          ipAddresses: [],
          dnsRecords: [
            // TXT: SPF token case must survive intact.
            {
              assetValue: 'www.hackerone.com',
              recordType: 'TXT',
              value: 'v=spf1 include:_spf.Google.com -all',
            },
            // CAA: tag value (issuer hostname after the tag) is case-sensitive
            // in real-world use (Let's Encrypt's `letsencrypt.org` is recorded
            // verbatim; mixed-case here proves we don't mangle it).
            {
              assetValue: 'www.hackerone.com',
              recordType: 'CAA',
              value: '0 issue "LetsEncrypt.ORG"',
            },
            // AAAA: uppercase + non-compressed → RFC 5952 lowercase + compressed.
            {
              assetValue: 'www.hackerone.com',
              recordType: 'AAAA',
              value: '2001:0DB8:0000:0000:0000:0000:0000:0001',
            },
          ],
          subdomainIps: [],
          httpProbes: [],
        }),
      } as never);

      await processor.process(job(dnsxPayload));

      const dnsCreate = prisma.dnsRecord as unknown as { create: jest.Mock };
      const createCalls = dnsCreate.create.mock.calls as Array<
        [{ data: { type: string; value: string } }]
      >;
      const byType = (t: string) => createCalls.find(([arg]) => arg.data.type === t)?.[0].data;

      expect(byType('TXT')?.value).toBe('v=spf1 include:_spf.Google.com -all');
      expect(byType('CAA')?.value).toBe('0 issue "LetsEncrypt.ORG"');
      expect(byType('AAAA')?.value).toBe('2001:db8::1');
    });
  });

  describe('Finding persistence (nuclei-json)', () => {
    const NUCLEI_JSONL = [
      JSON.stringify({
        'template-id': 'CVE-2021-44228',
        info: {
          name: 'Apache Log4j RCE',
          severity: 'critical',
          tags: ['cve', 'rce'],
          classification: { 'cve-id': ['CVE-2021-44228'] },
        },
        host: 'https://api.hackerone.com',
        'matched-at': 'https://API.hackerone.com/login',
        request: 'GET /login',
        response: '200 OK',
      }),
      JSON.stringify({
        'template-id': 'exposed-grafana',
        info: { name: 'Grafana Panel', severity: 'info' },
        'matched-at': 'https://api.hackerone.com/grafana/login',
      }),
      '',
    ].join('\n');

    const nucleiPayload: ParseJobPayload = {
      scanJobId: 'job_5',
      rawOutputKey: 'eng_1/scan_5/job_5/nuclei.jsonl',
      parserName: 'nuclei-json',
      scannerName: 'nuclei',
      target: 'https://api.hackerone.com',
      engagementId: 'eng_1',
    };

    beforeEach(() => {
      storage.getObject.mockResolvedValue({
        body: asStream(NUCLEI_JSONL),
        contentLength: NUCLEI_JSONL.length,
        contentType: 'application/x-ndjson',
      });

      // Simulate the SUBDOMAIN Asset existing from a prior scan (subfinder/httpx).
      (prisma.asset.findFirst as jest.Mock).mockImplementation(
        async ({ where }: { where: { canonicalValue?: string; engagementId?: string } }) => {
          if (where.canonicalValue === 'api.hackerone.com') {
            return { id: 'asset_api.hackerone.com' };
          }
          return null;
        },
      );
    });

    it('resolves the Finding to the Asset by canonical host extracted from location URL', async () => {
      await processor.process(job(nucleiPayload));

      const findingUpsert = prisma.finding as unknown as { upsert: jest.Mock };
      // Both findings attach to the same asset (api.hackerone.com, regardless of URL casing).
      expect(findingUpsert.upsert).toHaveBeenCalledTimes(2);
      const calls = findingUpsert.upsert.mock.calls as Array<
        [{ where: { assetId_dedupHash: { assetId: string } }; create: { assetId: string } }]
      >;
      for (const [arg] of calls) {
        expect(arg.where.assetId_dedupHash.assetId).toBe('asset_api.hackerone.com');
        expect(arg.create.assetId).toBe('asset_api.hackerone.com');
      }
    });

    it('uses the plan dedupHash recipe: sha256(scanner|templateId|host|location|sig)', async () => {
      await processor.process(job(nucleiPayload));

      const findingUpsert = prisma.finding as unknown as { upsert: jest.Mock };
      const calls = findingUpsert.upsert.mock.calls as Array<
        [{ where: { assetId_dedupHash: { dedupHash: string } }; create: { dedupHash: string } }]
      >;

      // Recompute the expected hash for the log4j finding.
      const { createHash } = await import('node:crypto');
      const expected = createHash('sha256')
        .update('nuclei')
        .update('|')
        .update('CVE-2021-44228') // templateId
        .update('|')
        .update('api.hackerone.com') // assetCanonical (canonical host)
        .update('|')
        .update('https://API.hackerone.com/login') // raw location preserved
        .update('|')
        .update('CVE-2021-44228') // sig = cveId
        .digest('hex');

      const log4jCall = calls.find(([arg]) => arg.create.dedupHash === expected);
      expect(log4jCall).toBeDefined();
    });

    it('persists Finding with firstSeenAt and lastSeenAt set to now', async () => {
      await processor.process(job(nucleiPayload));

      const findingUpsert = prisma.finding as unknown as { upsert: jest.Mock };
      const calls = findingUpsert.upsert.mock.calls as Array<
        [{ create: { firstSeenAt: Date; lastSeenAt: Date } }]
      >;
      for (const [arg] of calls) {
        expect(arg.create.firstSeenAt).toBeInstanceOf(Date);
        expect(arg.create.lastSeenAt).toBeInstanceOf(Date);
      }
    });

    it('returns findingsPersisted count', async () => {
      const result = await processor.process(job(nucleiPayload));
      expect(result.findingsPersisted).toBe(2);
    });

    it('calls assetMerge.dedupFindings after persistence', async () => {
      await processor.process(job(nucleiPayload));

      expect(assetMerge.dedupFindings).toHaveBeenCalledTimes(1);
      expect(assetMerge.dedupFindings).toHaveBeenCalledWith('eng_1');
    });

    it('skips and logs when no Asset matches the Finding host (no silent misattribution)', async () => {
      // No Asset rows exist in this engagement matching the host. The
      // resolution loop must drop the Finding rather than attach it to an
      // arbitrary unrelated Asset (which would corrupt per-asset counts).
      (prisma.asset.findFirst as jest.Mock).mockResolvedValue(null);
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

      const NUCLEI_WITHOUT_KNOWN_HOST = JSON.stringify({
        'template-id': 'tmpl-no-host-known',
        info: { name: 'Some Finding', severity: 'info' },
        'matched-at': 'https://unknown.example.com/',
      });
      storage.getObject.mockResolvedValueOnce({
        body: asStream(NUCLEI_WITHOUT_KNOWN_HOST),
        contentLength: NUCLEI_WITHOUT_KNOWN_HOST.length,
        contentType: 'application/x-ndjson',
      });

      const result = await processor.process(job(nucleiPayload));
      expect(result.findingsPersisted).toBe(0);
      expect(warn).toHaveBeenCalledWith(
        expect.stringMatching(
          /Skipping Finding: no Asset matched unknown\.example\.com.*template=tmpl-no-host-known/,
        ),
      );
      warn.mockRestore();
    });

    it('resolves IDN Finding locations against punycoded Asset rows', async () => {
      // A Finding whose location is `https://bücher.example/...` must match the
      // Asset row persisted with canonicalValue `xn--bcher-kva.example`. The
      // raw-lowercase fallback that used to live in urlToCanonicalHost would
      // have missed this lookup.
      (prisma.asset.findFirst as jest.Mock).mockResolvedValueOnce({ id: 'asset_idn' });

      const NUCLEI_IDN = JSON.stringify({
        'template-id': 'tmpl-idn',
        info: { name: 'IDN finding', severity: 'low' },
        'matched-at': 'https://bücher.example/login',
      });
      storage.getObject.mockResolvedValueOnce({
        body: asStream(NUCLEI_IDN),
        contentLength: NUCLEI_IDN.length,
        contentType: 'application/x-ndjson',
      });

      await processor.process(job(nucleiPayload));

      expect(prisma.asset.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            canonicalValue: 'xn--bcher-kva.example',
            deletedAt: null,
          }),
        }),
      );
      const findingUpsert = prisma.finding as unknown as { upsert: jest.Mock };
      expect(findingUpsert.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ assetId: 'asset_idn' }),
        }),
      );
    });

    it('does not rethrow when assetMerge.dedupFindings fails — persistence already succeeded', async () => {
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      (assetMerge.dedupFindings as jest.Mock).mockRejectedValueOnce(new Error('boom: dedup error'));

      await processor.process(job(nucleiPayload));

      expect(warn).toHaveBeenCalledWith(
        expect.stringMatching(/correlation pass \(Finding rows\) failed.*boom: dedup error/),
        expect.any(String),
      );
      warn.mockRestore();
    });

    it('processing the same fixture twice produces no duplicate Finding rows (upsert key collision)', async () => {
      // Two passes; second uses the same nuclei output.
      await processor.process(job(nucleiPayload));

      // Set up identical second run.
      storage.getObject.mockResolvedValueOnce({
        body: asStream(NUCLEI_JSONL),
        contentLength: NUCLEI_JSONL.length,
        contentType: 'application/x-ndjson',
      });
      const findingUpsert = prisma.finding as unknown as { upsert: jest.Mock };
      const firstRunDedupHashes = new Set(
        (findingUpsert.upsert.mock.calls as Array<[{ create: { dedupHash: string } }]>).map(
          ([arg]) => arg.create.dedupHash,
        ),
      );

      await processor.process(job(nucleiPayload));

      // Hashes from the second run must be a subset of the first — i.e. no new ones.
      const secondRunDedupHashes = new Set(
        (findingUpsert.upsert.mock.calls as Array<[{ create: { dedupHash: string } }]>).map(
          ([arg]) => arg.create.dedupHash,
        ),
      );
      for (const h of secondRunDedupHashes) {
        expect(firstRunDedupHashes.has(h)).toBe(true);
      }
      // Upsert was called 4 total times across two runs (2 findings × 2 runs).
      expect(findingUpsert.upsert).toHaveBeenCalledTimes(4);
    });

    describe('CVE_ENRICHMENT enqueue after Finding persist', () => {
      it('enqueues once per distinct cveId when findings have different cveIds', async () => {
        // NUCLEI_JSONL has 2 findings: CVE-2021-44228 (cveId set) + exposed-grafana (no cveId).
        // Expect exactly 1 enqueue call for CVE-2021-44228.
        await processor.process(job(nucleiPayload));

        expect(cveQueueMock.add).toHaveBeenCalledTimes(1);
        expect(cveQueueMock.add).toHaveBeenCalledWith(
          'enrich',
          { cveId: 'CVE-2021-44228' },
          { jobId: 'CVE-2021-44228' },
        );
      });

      it('deduplicates the same cveId when multiple findings share it in one parse job', async () => {
        // Two findings both with CVE-2021-44228 → only one enqueue.
        const NUCLEI_DUPE_CVE = [
          JSON.stringify({
            'template-id': 'CVE-2021-44228',
            info: {
              name: 'Apache Log4j RCE',
              severity: 'critical',
              classification: { 'cve-id': ['CVE-2021-44228'] },
            },
            'matched-at': 'https://api.hackerone.com/login',
          }),
          JSON.stringify({
            'template-id': 'CVE-2021-44228',
            info: {
              name: 'Apache Log4j RCE',
              severity: 'critical',
              classification: { 'cve-id': ['CVE-2021-44228'] },
            },
            'matched-at': 'https://api.hackerone.com/admin',
          }),
          '',
        ].join('\n');

        storage.getObject.mockResolvedValueOnce({
          body: asStream(NUCLEI_DUPE_CVE),
          contentLength: NUCLEI_DUPE_CVE.length,
          contentType: 'application/x-ndjson',
        });

        await processor.process(job(nucleiPayload));

        expect(cveQueueMock.add).toHaveBeenCalledTimes(1);
        expect(cveQueueMock.add).toHaveBeenCalledWith(
          'enrich',
          { cveId: 'CVE-2021-44228' },
          { jobId: 'CVE-2021-44228' },
        );
      });

      it('does not enqueue when all findings have cveId: null/undefined', async () => {
        const NUCLEI_NO_CVE = JSON.stringify({
          'template-id': 'exposed-grafana',
          info: { name: 'Grafana Panel', severity: 'info' },
          'matched-at': 'https://api.hackerone.com/grafana/login',
        });

        storage.getObject.mockResolvedValueOnce({
          body: asStream(NUCLEI_NO_CVE),
          contentLength: NUCLEI_NO_CVE.length,
          contentType: 'application/x-ndjson',
        });

        await processor.process(job(nucleiPayload));

        expect(cveQueueMock.add).not.toHaveBeenCalled();
      });

      it('does not fail the parse job when cveQueue.add throws', async () => {
        const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
        cveQueueMock.add.mockRejectedValueOnce(new Error('Redis connection lost'));

        const result = await processor.process(job(nucleiPayload));

        // Parse job still succeeded — findingsPersisted is non-zero.
        expect(result.findingsPersisted).toBe(2);
        expect(warn).toHaveBeenCalledWith(
          expect.stringMatching(
            /CVE_ENRICHMENT enqueue failed.*CVE-2021-44228.*Redis connection lost/,
          ),
        );
        warn.mockRestore();
      });
    });
  });

  describe('EngagementEvents publication', () => {
    it('publishes ASSET_ADDED for each newly persisted Asset (IP and non-IP)', async () => {
      await processor.process(job(payload));

      const kinds = eventsMock.publish.mock.calls.map(([ev]) => ev.kind);
      expect(kinds.filter((k) => k === EngagementUpdateKind.ASSET_ADDED).length).toBe(2);
      for (const [ev] of eventsMock.publish.mock.calls) {
        expect(ev.engagementId).toBe('eng_1');
        expect(typeof ev.ts).toBe('string');
      }
    });

    it('publishes ASSET_RISK_CHANGED after port persists (nmap emits 2 ports)', async () => {
      await processor.process(job(payload));

      const riskEvents = eventsMock.publish.mock.calls
        .map(([ev]) => ev)
        .filter((ev) => ev.kind === EngagementUpdateKind.ASSET_RISK_CHANGED);
      expect(riskEvents.length).toBeGreaterThanOrEqual(2);
    });

    it('publishes OBSERVATION_ADDED at least once per persist op', async () => {
      await processor.process(job(payload));

      const obsCount = eventsMock.publish.mock.calls.filter(
        ([ev]) => ev.kind === EngagementUpdateKind.OBSERVATION_ADDED,
      ).length;
      expect(obsCount).toBeGreaterThan(0);
    });

    it('does not throw when publisher rejects (swallowed by void)', async () => {
      eventsMock.publish.mockRejectedValue(new Error('redis down'));
      await expect(processor.process(job(payload))).resolves.toBeDefined();
    });
  });
});
