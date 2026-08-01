import { Injectable } from '@nestjs/common';
import { NotFoundError } from '@autoscanner/common';
import { PrismaService } from '@autoscanner/database';
import type { AnnotationRequest } from '@autoscanner/service-clients';

/**
 * Writes the operator-owned annotation fields on a cluster (`note`, `remediation`).
 *
 * These never carry an audit event or a status change — they are free-text operator notes —
 * but they still live on `CorrelatedFinding`, so the write belongs here to keep finding-service
 * the single writer of that table (SP2 design §done-criterion: no CorrelatedFinding writes
 * outside finding-service). Only the keys the caller actually supplied are updated, so a note
 * edit never clobbers a previously-set remediation and vice versa.
 */
@Injectable()
export class AnnotationService {
  constructor(private readonly prisma: PrismaService) {}

  async setAnnotations(req: AnnotationRequest): Promise<{ id: string }> {
    const cluster = await this.prisma.correlatedFinding.findUnique({
      where: { id: req.correlatedFindingId },
      select: { id: true },
    });
    if (!cluster) throw new NotFoundError('CorrelatedFinding', req.correlatedFindingId);

    const data: { note?: string | null; remediation?: string | null } = {};
    if (req.note !== undefined) data.note = req.note;
    if (req.remediation !== undefined) data.remediation = req.remediation;

    if (Object.keys(data).length > 0) {
      await this.prisma.correlatedFinding.update({ where: { id: cluster.id }, data });
    }
    return { id: cluster.id };
  }
}
