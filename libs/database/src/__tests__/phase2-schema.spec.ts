/**
 * Phase 2 Schema Tests — verifies the new recon models introduced in the
 * phase2_recon_models migration are wired up correctly.
 *
 * Requires a live Postgres reachable at DATABASE_URL (run `pnpm dev:up` first).
 */
import { PrismaClient } from '@prisma/client';

const DATABASE_URL = process.env['DATABASE_URL'];

if (!DATABASE_URL) {
  throw new Error(
    'DATABASE_URL is not set. Start the dev stack with `pnpm dev:up` before running these tests.',
  );
}

const prisma = new PrismaClient({
  datasources: { db: { url: DATABASE_URL } },
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function createTestEngagementAndUser(suffix: string) {
  const user = await prisma.user.create({
    data: {
      email: `test-phase2-${suffix}@autoscanner.test`,
      passwordHash: 'hash',
      displayName: `Test ${suffix}`,
    },
  });

  const engagement = await prisma.engagement.create({
    data: {
      ownerId: user.id,
      name: `Phase2 Engagement ${suffix}`,
      clientName: `Client ${suffix}`,
    },
  });

  return { user, engagement };
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeAll(async () => {
  try {
    await prisma.$connect();
  } catch (err) {
    throw new Error(
      `Cannot connect to Postgres at ${DATABASE_URL}. Is pnpm dev:up running?\n${String(err)}`,
    );
  }
});

afterAll(async () => {
  // Clean up all test data using cascade deletes via engagement removal.
  await prisma.engagement.deleteMany({
    where: { name: { startsWith: 'Phase2 Engagement' } },
  });
  await prisma.user.deleteMany({
    where: { email: { contains: '@autoscanner.test' } },
  });
  await prisma.$disconnect();
});

// ---------------------------------------------------------------------------
// Test 1 — Insert chain: Domain → Subdomain → IpAddress → SubdomainIp
//           → DnsRecord → Technology
// ---------------------------------------------------------------------------

describe('Phase 2 insert chain', () => {
  it('creates Domain, Subdomain, IpAddress, SubdomainIp, DnsRecord, and Technology', async () => {
    const { engagement } = await createTestEngagementAndUser('chain');

    // 1. Domain
    const domain = await prisma.domain.create({
      data: {
        engagementId: engagement.id,
        value: 'example.com',
        canonicalValue: 'example.com',
      },
    });
    expect(domain.id).toBeTruthy();
    expect(domain.value).toBe('example.com');

    // 2. Subdomain
    const subdomain = await prisma.subdomain.create({
      data: {
        engagementId: engagement.id,
        domainId: domain.id,
        value: 'sub.example.com',
        canonicalValue: 'sub.example.com',
        httpStatus: 200,
        httpTitle: 'Hello',
        httpServer: 'nginx',
      },
    });
    expect(subdomain.id).toBeTruthy();
    expect(subdomain.domainId).toBe(domain.id);

    // 3. IpAddress
    const ip = await prisma.ipAddress.create({
      data: {
        engagementId: engagement.id,
        value: '1.2.3.4',
        canonicalValue: '1.2.3.4',
        version: 'IPV4',
      },
    });
    expect(ip.id).toBeTruthy();

    // 4. SubdomainIp (join table)
    const subdomainIp = await prisma.subdomainIp.create({
      data: {
        subdomainId: subdomain.id,
        ipAddressId: ip.id,
      },
    });
    expect(subdomainIp.subdomainId).toBe(subdomain.id);
    expect(subdomainIp.ipAddressId).toBe(ip.id);

    // 5. DnsRecord linked to domain
    const dnsRecord = await prisma.dnsRecord.create({
      data: {
        domainId: domain.id,
        type: 'A',
        name: 'example.com.',
        value: '1.2.3.4',
        ttl: 300,
      },
    });
    expect(dnsRecord.id).toBeTruthy();
    expect(dnsRecord.type).toBe('A');

    // 6. Asset of type DOMAIN (with domainId FK) so Technology can attach
    const asset = await prisma.asset.create({
      data: {
        engagementId: engagement.id,
        type: 'DOMAIN',
        value: 'example.com',
        canonicalValue: 'example.com',
        domainId: domain.id,
      },
    });

    // 7. Technology on the asset
    const tech = await prisma.technology.create({
      data: {
        assetId: asset.id,
        name: 'nginx',
        version: '1.24.0',
        source: 'httpx',
        categories: ['web-server'],
      },
    });
    expect(tech.id).toBeTruthy();
    expect(tech.name).toBe('nginx');
  });
});

// ---------------------------------------------------------------------------
// Test 2 — CHECK constraint rejects Asset of type=DOMAIN without domainId
// ---------------------------------------------------------------------------

describe('Asset polymorphic CHECK constraint', () => {
  it('rejects Asset type=DOMAIN when domainId is null', async () => {
    const { engagement } = await createTestEngagementAndUser('check');

    await expect(
      prisma.asset.create({
        data: {
          engagementId: engagement.id,
          type: 'DOMAIN',
          value: 'bad.example.com',
          canonicalValue: 'bad.example.com',
          // domainId intentionally omitted — should violate CHECK constraint
        },
      }),
    ).rejects.toThrow();
  });

  it('rejects Asset type=SUBDOMAIN when subdomainId is null', async () => {
    const { engagement } = await createTestEngagementAndUser('check2');

    await expect(
      prisma.asset.create({
        data: {
          engagementId: engagement.id,
          type: 'SUBDOMAIN',
          value: 'sub.bad.example.com',
          canonicalValue: 'sub.bad.example.com',
          // subdomainId intentionally omitted
        },
      }),
    ).rejects.toThrow();
  });

  it('rejects Asset type=IP_ADDRESS when ipAddressId is null', async () => {
    const { engagement } = await createTestEngagementAndUser('check3');

    await expect(
      prisma.asset.create({
        data: {
          engagementId: engagement.id,
          type: 'IP_ADDRESS',
          value: '5.6.7.8',
          canonicalValue: '5.6.7.8',
          // ipAddressId intentionally omitted
        },
      }),
    ).rejects.toThrow();
  });

  it('allows Asset type=URL (no polymorphic FK required)', async () => {
    const { engagement } = await createTestEngagementAndUser('check4');

    const asset = await prisma.asset.create({
      data: {
        engagementId: engagement.id,
        type: 'URL',
        value: 'https://example.com/path',
        canonicalValue: 'https://example.com/path',
      },
    });
    expect(asset.id).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Test 3 — @@unique([engagementId, canonicalValue]) enforcement
// ---------------------------------------------------------------------------

describe('Unique constraints on Domain, Subdomain, IpAddress', () => {
  it('rejects duplicate Domain (engagementId, canonicalValue)', async () => {
    const { engagement } = await createTestEngagementAndUser('unique-domain');

    await prisma.domain.create({
      data: {
        engagementId: engagement.id,
        value: 'unique.com',
        canonicalValue: 'unique.com',
      },
    });

    await expect(
      prisma.domain.create({
        data: {
          engagementId: engagement.id,
          value: 'unique.com',
          canonicalValue: 'unique.com',
        },
      }),
    ).rejects.toThrow();
  });

  it('rejects duplicate Subdomain (engagementId, canonicalValue)', async () => {
    const { engagement } = await createTestEngagementAndUser('unique-sub');

    const domain = await prisma.domain.create({
      data: {
        engagementId: engagement.id,
        value: 'unique2.com',
        canonicalValue: 'unique2.com',
      },
    });

    await prisma.subdomain.create({
      data: {
        engagementId: engagement.id,
        domainId: domain.id,
        value: 'www.unique2.com',
        canonicalValue: 'www.unique2.com',
      },
    });

    await expect(
      prisma.subdomain.create({
        data: {
          engagementId: engagement.id,
          domainId: domain.id,
          value: 'www.unique2.com',
          canonicalValue: 'www.unique2.com',
        },
      }),
    ).rejects.toThrow();
  });

  it('rejects duplicate IpAddress (engagementId, canonicalValue)', async () => {
    const { engagement } = await createTestEngagementAndUser('unique-ip');

    await prisma.ipAddress.create({
      data: {
        engagementId: engagement.id,
        value: '9.9.9.9',
        canonicalValue: '9.9.9.9',
        version: 'IPV4',
      },
    });

    await expect(
      prisma.ipAddress.create({
        data: {
          engagementId: engagement.id,
          value: '9.9.9.9',
          canonicalValue: '9.9.9.9',
          version: 'IPV4',
        },
      }),
    ).rejects.toThrow();
  });
});
