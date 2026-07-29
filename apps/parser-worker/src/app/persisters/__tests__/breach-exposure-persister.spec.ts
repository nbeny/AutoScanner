import { BreachExposurePersister } from '../breach-exposure-persister';
import type { NormalizedBreachExposure, ParserContext } from '@autoscanner/parsers';

const ctx: ParserContext = {
  scanJobId: 'j',
  scannerName: 'h8mail',
  target: 'a@x.com',
  engagementId: 'eng-1',
};

function makePrisma(emailRow: { id: string } | null = null) {
  const findFirst = jest.fn().mockResolvedValue(emailRow);
  const upsert = jest.fn().mockResolvedValue({});
  return { findFirst, upsert, prisma: { email: { findFirst }, breachExposure: { upsert } } };
}

describe('BreachExposurePersister', () => {
  it('upserts one row per exposure keyed by (engagement, seed, breachName, source)', async () => {
    const { findFirst, upsert, prisma } = makePrisma({ id: 'email_1' });
    const persister = new BreachExposurePersister(prisma as never);
    const items: NormalizedBreachExposure[] = [
      {
        seed: 'a@x.com',
        breachName: 'linkedin.com',
        dataClasses: ['Passwords', 'Email addresses'],
        passwordExposed: true,
        severity: 'HIGH',
        source: 'H8MAIL',
      },
      {
        seed: 'a@x.com',
        breachName: 'dropbox',
        dataClasses: ['Email addresses'],
        passwordExposed: false,
        severity: 'MEDIUM',
        source: 'H8MAIL',
      },
    ];

    const count = await persister.upsert(items, ctx);

    expect(count).toBe(2);
    expect(upsert).toHaveBeenCalledTimes(2);
    expect(findFirst).toHaveBeenCalledWith({
      where: { engagementId: 'eng-1', address: 'a@x.com' },
      select: { id: true },
    });
    expect(upsert.mock.calls[0][0]).toMatchObject({
      where: {
        engagementId_seed_breachName_source: {
          engagementId: 'eng-1',
          seed: 'a@x.com',
          breachName: 'linkedin.com',
          source: 'H8MAIL',
        },
      },
      create: expect.objectContaining({
        engagementId: 'eng-1',
        emailId: 'email_1',
        seed: 'a@x.com',
        breachName: 'linkedin.com',
        dataClasses: ['Passwords', 'Email addresses'],
        passwordExposed: true,
        severity: 'HIGH',
        source: 'H8MAIL',
      }),
      update: expect.objectContaining({
        passwordExposed: true,
        severity: 'HIGH',
        emailId: 'email_1',
      }),
    });
  });

  it('links emailId to null when no matching Email row exists', async () => {
    const { upsert, prisma } = makePrisma(null);
    const persister = new BreachExposurePersister(prisma as never);
    await persister.upsert(
      [
        {
          seed: 'unknown@x.com',
          breachName: 'somebreach',
          dataClasses: [],
          passwordExposed: false,
          severity: 'LOW',
          source: 'LEAKIX',
        },
      ],
      ctx,
    );

    expect(upsert.mock.calls[0][0]).toMatchObject({
      create: expect.objectContaining({ emailId: null }),
      update: expect.objectContaining({ emailId: undefined }),
    });
  });

  it('skips exposures with empty seed or breachName', async () => {
    const { upsert, prisma } = makePrisma();
    const persister = new BreachExposurePersister(prisma as never);
    const count = await persister.upsert(
      [
        {
          seed: '  ',
          breachName: 'linkedin.com',
          dataClasses: [],
          passwordExposed: false,
          severity: 'LOW',
          source: 'H8MAIL',
        },
        {
          seed: 'a@x.com',
          breachName: '   ',
          dataClasses: [],
          passwordExposed: false,
          severity: 'LOW',
          source: 'H8MAIL',
        },
      ],
      ctx,
    );
    expect(count).toBe(0);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('parses breachDate into a Date when provided', async () => {
    const { upsert, prisma } = makePrisma({ id: 'email_1' });
    const persister = new BreachExposurePersister(prisma as never);
    await persister.upsert(
      [
        {
          seed: 'a@x.com',
          breachName: 'linkedin.com',
          breachDate: '2016-05-01',
          dataClasses: ['Passwords'],
          passwordExposed: true,
          severity: 'HIGH',
          source: 'H8MAIL',
        },
      ],
      ctx,
    );
    const createArg = upsert.mock.calls[0][0].create;
    expect(createArg.breachDate).toBeInstanceOf(Date);
    expect((createArg.breachDate as Date).toISOString()).toContain('2016-05-01');
  });
});
