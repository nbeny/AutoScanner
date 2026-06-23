import type { PrismaService } from '@autoscanner/database';
import type { TemplateStep } from '@autoscanner/templates';
import { ContextBuilder, type TemplateRunLike } from '../context-builder.service';

const run: TemplateRunLike = { id: 'run_1', engagementId: 'eng_1', target: 'example.com' };

function makePrisma(overrides: Record<string, unknown> = {}): PrismaService {
  return {
    subdomain: { findMany: jest.fn().mockResolvedValue([]) },
    ipAddress: { findMany: jest.fn().mockResolvedValue([]) },
    endpoint: { findMany: jest.fn().mockResolvedValue([]) },
    ...overrides,
  } as unknown as PrismaService;
}

const endpointsStep: TemplateStep = {
  scannerName: 'web-dast',
  inputs: {},
  target: { kind: 'context', path: 'endpoints' },
};

describe('ContextBuilder — endpoints path', () => {
  it('resolves endpoints to their canonicalUrl values', async () => {
    const prisma = makePrisma({
      endpoint: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { canonicalUrl: 'https://example.com/search?q=1' },
            { canonicalUrl: 'https://example.com/api/users?id=2' },
          ]),
      },
    });
    const builder = new ContextBuilder(prisma);

    const targets = await builder.buildTargets(endpointsStep, run, 4);

    expect(targets).toEqual([
      'https://example.com/search?q=1',
      'https://example.com/api/users?id=2',
    ]);
    expect(prisma.endpoint.findMany as jest.Mock).toHaveBeenCalledWith({
      where: { engagementId: 'eng_1' },
    });
  });

  it('falls back to the root target (D3) when no endpoints exist and stepIndex > 0', async () => {
    const builder = new ContextBuilder(makePrisma());
    const targets = await builder.buildTargets(endpointsStep, run, 4);
    expect(targets).toEqual(['example.com']);
  });
});
