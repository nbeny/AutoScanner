/**
 * ParseJobProcessor — post-SP1a scope.
 *
 * Asset- and discovery-side persistence moved to asset-service / discovery-service, so this
 * suite no longer asserts row-level upserts. What parser-worker still owns, and is therefore
 * tested here:
 *   - parse mechanics (registry lookup, empty/oversize raw output)
 *   - delegating each entity group to the right batch client, with the right payload
 *   - resolving each finding to an asset and batching it to finding-service (SP2a: the
 *     Finding writes moved out; parser-worker only assembles the batch now)
 *   - CVE enrichment publishing
 *   - the engagement-wide correlation passes and their best-effort failure semantics
 *   - engagement event publication
 *
 * Entity-level coverage (subdomain chain, technology merge, DNS records, IP versions,
 * legacy-row promotion, canonicalisation) belongs with the services that now own those
 * writes; porting it there is tracked as a follow-up task in the SP1a plan.
 */
import { Readable } from 'node:stream';
import { Logger } from '@nestjs/common';
import type { PrismaService } from '@autoscanner/database';
import {
  DnsxJsonParser,
  HttpxJsonParser,
  NmapXmlParser,
  NucleiJsonParser,
  ParserRegistry,
  SubfinderJsonParser,
} from '@autoscanner/parsers';
import type { ParseJobPayload } from '@autoscanner/queues';
import type { ObjectStorage } from '@autoscanner/storage';
import type { ConsumerRegistrar, MessageContext } from '@autoscanner/messaging';

import { ParseJobProcessor } from '../parse-job.processor';

const NMAP_XML = `<?xml version="1.0"?>
<nmaprun scanner="nmap">
  <host>
    <address addr="10.0.0.5" addrtype="ipv4"/>
    <ports>
      <port protocol="tcp" portid="22"><state state="open"/><service name="ssh" product="OpenSSH" version="9.0"/></port>
      <port protocol="tcp" portid="80"><state state="open"/><service name="http"/></port>
    </ports>
  </host>
</nmaprun>`;

const NUCLEI_JSON = JSON.stringify({
  'template-id': 'CVE-2021-44228',
  info: {
    name: 'Apache Log4j RCE',
    severity: 'critical',
    classification: { 'cve-id': ['CVE-2021-44228'] },
  },
  host: 'https://app.example.com',
  'matched-at': 'https://app.example.com/api',
});

function assetBatchResponse(assetIds: Record<string, string> = {}) {
  return {
    assetIdsByCanonicalValue: assetIds,
    assetsPersisted: Object.keys(assetIds).length,
    portsPersisted: 0,
    servicesPersisted: 0,
    technologiesPersisted: 0,
    observationsPersisted: 0,
  };
}

function discoveryBatchResponse() {
  return {
    dnsRecordsPersisted: 0,
    endpointsPersisted: 0,
    emailsPersisted: 0,
    identitiesPersisted: 0,
    breachExposuresPersisted: 0,
    orgMetadataPersisted: 0,
    tlsCertificatesPersisted: 0,
    subdomainIpsPersisted: 0,
    linkedHosts: [] as string[],
  };
}

describe('ParseJobProcessor', () => {
  let processor: ParseJobProcessor;
  let prisma: {
    asset: { findFirst: jest.Mock };
    finding: { upsert: jest.Mock; findMany: jest.Mock };
    assetObservation: { create: jest.Mock; count: jest.Mock };
    $transaction: jest.Mock;
  };
  let storage: jest.Mocked<ObjectStorage>;
  let registry: ParserRegistry;
  let findingClient: {
    batch: jest.Mock;
    correlate: jest.Mock;
    dedup: jest.Mock;
    setStatus: jest.Mock;
  };
  let busMock: { publish: jest.Mock };
  let eventsMock: { publish: jest.Mock };
  let assetClient: { parseBatch: jest.Mock; recomputeRisk: jest.Mock };
  let discoveryClient: {
    parseBatch: jest.Mock;
    mergeSubdomains: jest.Mock;
    mergeIpAddresses: jest.Mock;
  };

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    prisma = {
      asset: { findFirst: jest.fn().mockResolvedValue(null) },
      finding: {
        upsert: jest.fn().mockResolvedValue({}),
        // runRiskRecomputePass reads distinct assetIds that have findings.
        findMany: jest.fn().mockResolvedValue([{ assetId: 'asset_web' }]),
      },
      assetObservation: {
        create: jest.fn().mockResolvedValue({}),
        count: jest.fn().mockResolvedValue(0),
      },
      $transaction: jest.fn(async (fn: (tx: unknown) => unknown) => fn(prisma)),
    };

    storage = {
      getObject: jest.fn(async () => ({
        body: Readable.from([Buffer.from(NMAP_XML, 'utf8')]),
        contentLength: Buffer.byteLength(NMAP_XML),
      })),
    } as unknown as jest.Mocked<ObjectStorage>;

    registry = new ParserRegistry();
    registry.register(new NmapXmlParser());
    registry.register(new SubfinderJsonParser());
    registry.register(new HttpxJsonParser());
    registry.register(new DnsxJsonParser());
    registry.register(new NucleiJsonParser());

    findingClient = {
      // batch echoes one persisted finding per item so findingsPersisted stays meaningful.
      batch: jest.fn(async (req: { findings: unknown[] }) => ({
        findingsPersisted: req.findings.length,
        affectedAssetIds: [],
        observations: [],
      })),
      correlate: jest.fn().mockResolvedValue({ clusters: 0 }),
      dedup: jest.fn().mockResolvedValue({ merged: 0 }),
      setStatus: jest.fn().mockResolvedValue({ id: 'c1', status: 'OPEN' }),
    };

    busMock = { publish: jest.fn().mockResolvedValue(undefined) };
    eventsMock = { publish: jest.fn().mockResolvedValue(undefined) };
    assetClient = {
      parseBatch: jest.fn().mockResolvedValue(assetBatchResponse({ '10.0.0.5': 'asset_ip' })),
      recomputeRisk: jest.fn().mockResolvedValue(undefined),
    };
    discoveryClient = {
      parseBatch: jest.fn().mockResolvedValue(discoveryBatchResponse()),
      mergeSubdomains: jest.fn().mockResolvedValue({ merged: 0 }),
      mergeIpAddresses: jest.fn().mockResolvedValue({ merged: 0 }),
    };

    processor = new ParseJobProcessor(
      registry,
      storage,
      prisma as unknown as PrismaService,
      assetClient as never,
      discoveryClient as never,
      findingClient as never,
      busMock as never,
      eventsMock as never,
      { register: jest.fn() } as unknown as ConsumerRegistrar,
    );
  });

  afterEach(() => jest.restoreAllMocks());

  const job = (p: ParseJobPayload) =>
    ({
      id: 'msg_1',
      type: 'security.parse.requested',
      key: p.scanJobId,
      attempt: 1,
      payload: p,
    }) as MessageContext<ParseJobPayload>;

  const payload: ParseJobPayload = {
    scanJobId: 'job_1',
    rawOutputKey: 'eng_1/scan_1/job_1/nmap-xml.xml',
    parserName: 'nmap-xml',
    scannerName: 'nmap',
    target: '10.0.0.5',
    engagementId: 'eng_1',
  };

  // ─── parse mechanics ───────────────────────────────────────────────────────

  it('throws when the parser is not in the registry so the job can retry/dead-letter', async () => {
    await expect(
      processor.process(job({ ...payload, parserName: 'does-not-exist' })),
    ).rejects.toThrow();
  });

  it('throws when raw output is empty', async () => {
    storage.getObject = jest.fn(async () => ({
      body: Readable.from([Buffer.from('', 'utf8')]),
      contentLength: 0,
    })) as never;
    await expect(processor.process(job(payload))).rejects.toThrow(/empty/i);
  });

  it('refuses to load an oversize raw output into memory', async () => {
    // The cap counts bytes actually streamed (not the declared contentLength), so emit
    // more than MAX_RAW_OUTPUT_BYTES in chunks and assert it bails mid-stream.
    const chunk = Buffer.alloc(8 * 1024 * 1024, 0x41);
    const chunks = Array.from({ length: 33 }, () => chunk); // 264 MiB > 256 MiB cap
    storage.getObject = jest.fn(async () => ({
      body: Readable.from(chunks),
      contentLength: chunks.length * chunk.length,
    })) as never;
    await expect(processor.process(job(payload))).rejects.toThrow(/exceeds/i);
  });

  // ─── delegation to the services ────────────────────────────────────────────

  describe('batch delegation', () => {
    it('sends the parsed assets/ports/services to asset-service with the job scope', async () => {
      await processor.process(job(payload));

      expect(assetClient.parseBatch).toHaveBeenCalled();
      const req = assetClient.parseBatch.mock.calls[0][0];
      expect(req).toMatchObject({
        engagementId: 'eng_1',
        scanJobId: 'job_1',
        scannerName: 'nmap',
      });
      expect(req.assets.map((a: { value: string }) => a.value)).toContain('10.0.0.5');
      expect(req.ports).toHaveLength(2);
      expect(req.services.length).toBeGreaterThan(0);
    });

    it('sends the discovery entity groups to discovery-service with the target', async () => {
      await processor.process(job(payload));

      expect(discoveryClient.parseBatch).toHaveBeenCalledTimes(1);
      const req = discoveryClient.parseBatch.mock.calls[0][0];
      expect(req).toMatchObject({
        engagementId: 'eng_1',
        scanJobId: 'job_1',
        target: '10.0.0.5',
      });
      for (const group of [
        'dnsRecords',
        'endpoints',
        'emails',
        'identities',
        'breachExposures',
        'orgMetadata',
        'tlsCertificates',
        'subdomainIpLinks',
      ]) {
        expect(Array.isArray(req[group])).toBe(true);
      }
    });

    it('reports the counts the services returned', async () => {
      assetClient.parseBatch.mockResolvedValue({
        ...assetBatchResponse({ '10.0.0.5': 'asset_ip' }),
        portsPersisted: 2,
        servicesPersisted: 1,
      });
      discoveryClient.parseBatch.mockResolvedValue({
        ...discoveryBatchResponse(),
        endpointsPersisted: 3,
      });

      const res = await processor.process(job(payload));

      expect(res).toMatchObject({
        assetsPersisted: 1,
        portsPersisted: 2,
        servicesPersisted: 1,
        endpointsPersisted: 3,
      });
    });

    it('fails the job when asset-service rejects, so the retry topic re-drives it', async () => {
      assetClient.parseBatch.mockRejectedValue(new Error('asset-service 503'));
      await expect(processor.process(job(payload))).rejects.toThrow('asset-service 503');
    });
  });

  // ─── correlation passes ────────────────────────────────────────────────────

  describe('correlation passes after persist', () => {
    it('runs the subdomain/IP merges through discovery-service', async () => {
      await processor.process(job(payload));
      expect(discoveryClient.mergeSubdomains).toHaveBeenCalledWith('eng_1');
      expect(discoveryClient.mergeIpAddresses).toHaveBeenCalledWith('eng_1');
    });

    it('does not rethrow when a correlation pass fails — persistence already succeeded', async () => {
      discoveryClient.mergeSubdomains.mockRejectedValue(new Error('merge boom'));
      findingClient.correlate.mockRejectedValue(new Error('corr boom'));
      await expect(processor.process(job(payload))).resolves.toBeDefined();
    });
  });

  // ─── findings (assembled here, written by finding-service since SP2a) ───────

  describe('Finding batching', () => {
    const nucleiPayload: ParseJobPayload = {
      ...payload,
      rawOutputKey: 'eng_1/scan_1/job_2/nuclei.json',
      parserName: 'nuclei-json',
      scannerName: 'nuclei',
      target: 'app.example.com',
    };

    beforeEach(() => {
      storage.getObject = jest.fn(async () => ({
        body: Readable.from([Buffer.from(NUCLEI_JSON, 'utf8')]),
        contentLength: Buffer.byteLength(NUCLEI_JSON),
      })) as never;
      assetClient.parseBatch.mockResolvedValue(
        assetBatchResponse({ 'app.example.com': 'asset_web' }),
      );
    });

    it('attaches the finding to the asset id the batch returned (no per-finding lookup)', async () => {
      const res = await processor.process(job(nucleiPayload));

      expect(res.findingsPersisted).toBe(1);
      // finding-service is the writer now: the processor hands it a batch keyed on the
      // asset id the asset batch already resolved, not a per-finding DB lookup.
      expect(findingClient.batch).toHaveBeenCalledWith(
        expect.objectContaining({
          findings: expect.arrayContaining([expect.objectContaining({ assetId: 'asset_web' })]),
        }),
      );
      // The batch map answered, so the DB fallback was not needed.
      expect(prisma.asset.findFirst).not.toHaveBeenCalled();
    });

    it('falls back to a DB lookup for assets persisted by an earlier parse job', async () => {
      assetClient.parseBatch.mockResolvedValue(assetBatchResponse({}));
      prisma.asset.findFirst.mockResolvedValue({ id: 'asset_from_db' });

      const res = await processor.process(job(nucleiPayload));

      expect(res.findingsPersisted).toBe(1);
      expect(prisma.asset.findFirst).toHaveBeenCalled();
    });

    it('skips the finding when no asset matches — never misattributes', async () => {
      assetClient.parseBatch.mockResolvedValue(assetBatchResponse({}));
      prisma.asset.findFirst.mockResolvedValue(null);

      const res = await processor.process(job(nucleiPayload));

      expect(res.findingsPersisted).toBe(0);
      // No asset matched, so there is nothing to batch — finding-service is never called.
      expect(findingClient.batch).not.toHaveBeenCalled();
    });

    it('recomputes risk through asset-service so Asset.riskScore keeps one writer', async () => {
      await processor.process(job(nucleiPayload));
      expect(assetClient.recomputeRisk).toHaveBeenCalledWith('asset_web');
    });

    it('publishes CVE enrichment once per distinct cveId', async () => {
      await processor.process(job(nucleiPayload));
      const enrichCalls = busMock.publish.mock.calls.filter(
        (c) => c[0] === 'security.cve.enrich.requested',
      );
      expect(enrichCalls).toHaveLength(1);
      expect(enrichCalls[0][2]).toEqual({ cveId: 'CVE-2021-44228' });
    });

    it('does not fail the parse job when publishing enrichment throws', async () => {
      busMock.publish.mockRejectedValue(new Error('bus down'));
      await expect(processor.process(job(nucleiPayload))).resolves.toBeDefined();
    });
  });

  // ─── engagement events ─────────────────────────────────────────────────────

  describe('EngagementEvents publication', () => {
    it('publishes ASSET_ADDED for each asset the batch reported', async () => {
      await processor.process(job(payload));
      const kinds = eventsMock.publish.mock.calls.map((c) => c[0].kind);
      expect(kinds).toContain('ASSET_ADDED');
    });

    it('publishes OBSERVATION_ADDED at least once', async () => {
      await processor.process(job(payload));
      const kinds = eventsMock.publish.mock.calls.map((c) => c[0].kind);
      expect(kinds).toContain('OBSERVATION_ADDED');
    });
  });
});
