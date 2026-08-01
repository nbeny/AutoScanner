jest.mock('@autoscanner/correlation', () => ({
  categorize: jest.fn(),
}));
import { categorize } from '@autoscanner/correlation';

import { ComplianceService } from '../compliance.service';

function harness() {
  const upsert = jest.fn().mockResolvedValue({});
  const prisma = { complianceMapping: { upsert, findMany: jest.fn() } };
  return { svc: new ComplianceService(prisma as never), upsert };
}

const event = {
  engagementId: 'eng_1',
  findingId: 'f1',
  title: 'SQL injection in id param',
  templateId: null,
  cveId: null,
};

describe('ComplianceService.map', () => {
  beforeEach(() => jest.clearAllMocks());

  it('maps a categorized finding to one row per control', async () => {
    (categorize as jest.Mock).mockReturnValue('sql-injection');
    const { svc, upsert } = harness();

    const res = await svc.map(event);

    // sql-injection has 3 controls in the shipped ruleset.
    expect(res.mappings).toBeGreaterThanOrEqual(2);
    expect(upsert).toHaveBeenCalledTimes(res.mappings);
    const arg = upsert.mock.calls[0][0];
    expect(arg.where.engagementId_findingId_framework_controlId).toMatchObject({
      engagementId: 'eng_1',
      findingId: 'f1',
    });
    expect(arg.create).toMatchObject({ engagementId: 'eng_1', findingId: 'f1' });
  });

  it('writes nothing when the finding has no recognised category', async () => {
    (categorize as jest.Mock).mockReturnValue(null);
    const { svc, upsert } = harness();

    const res = await svc.map(event);

    expect(res).toEqual({ mappings: 0 });
    expect(upsert).not.toHaveBeenCalled();
  });

  it('continues when one upsert fails', async () => {
    (categorize as jest.Mock).mockReturnValue('sql-injection');
    const { svc, upsert } = harness();
    upsert.mockRejectedValueOnce(new Error('db boom'));

    const res = await svc.map(event);

    // One failed, the rest still persisted.
    expect(res.mappings).toBeGreaterThanOrEqual(1);
  });
});
