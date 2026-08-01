/**
 * AnnotationService owns the operator note/remediation writes on CorrelatedFinding.
 *
 * These tests pin two things: it never touches `status` (that is triage's job and the product
 * invariant), and it only writes the keys the caller actually supplied, so editing a note can
 * never blank out a previously-set remediation.
 */
import { AnnotationService } from '../annotation.service';

function makeHarness(exists = true) {
  const update = jest.fn().mockResolvedValue({ id: 'c1' });
  const prisma = {
    correlatedFinding: {
      findUnique: jest.fn().mockResolvedValue(exists ? { id: 'c1' } : null),
      update,
    },
  };
  return { svc: new AnnotationService(prisma as never), prisma, update };
}

describe('AnnotationService.setAnnotations', () => {
  it('rejects an unknown cluster instead of writing one', async () => {
    const { svc, update } = makeHarness(false);

    await expect(
      svc.setAnnotations({ correlatedFindingId: 'missing', note: 'x' }),
    ).rejects.toThrow();
    expect(update).not.toHaveBeenCalled();
  });

  it('writes only the supplied keys and never status', async () => {
    const { svc, update } = makeHarness();

    await svc.setAnnotations({ correlatedFindingId: 'c1', note: 'looks exploitable' });

    const arg = update.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(arg.data).toEqual({ note: 'looks exploitable' });
    expect(Object.keys(arg.data)).not.toContain('status');
    expect(Object.keys(arg.data)).not.toContain('remediation');
  });

  it('updates both note and remediation when both are provided', async () => {
    const { svc, update } = makeHarness();

    await svc.setAnnotations({ correlatedFindingId: 'c1', note: 'n', remediation: 'patch' });

    expect(update.mock.calls[0][0].data).toEqual({ note: 'n', remediation: 'patch' });
  });

  it('skips the write entirely when neither field is supplied', async () => {
    const { svc, update } = makeHarness();

    const res = await svc.setAnnotations({ correlatedFindingId: 'c1' });

    expect(update).not.toHaveBeenCalled();
    expect(res).toEqual({ id: 'c1' });
  });
});
