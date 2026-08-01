import { Injectable } from '@nestjs/common';
import type { FindingStatus } from '@prisma/client';
import { NotFoundError } from '@autoscanner/common';
import { PrismaService } from '@autoscanner/database';
import type { TriageRequest } from '@autoscanner/service-clients';

/**
 * The ONLY code path allowed to write `CorrelatedFinding.status`.
 *
 * Every other writer (the correlation pass, and the threat-intel / compliance services SP2d
 * adds) must leave `status` alone — that is the product invariant "re-scans never overwrite
 * an operator's triage". Concentrating the write here is what turns that invariant from a
 * convention (the absence of a key in one object literal) into something a reviewer can see.
 *
 * The status change and its audit row commit together, so a cluster can never show a new
 * status with no `FindingStatusEvent` explaining it.
 */
@Injectable()
export class TriageService {
  constructor(private readonly prisma: PrismaService) {}

  async setStatus(req: TriageRequest): Promise<{ id: string; status: string }> {
    const cluster = await this.prisma.correlatedFinding.findUnique({
      where: { id: req.correlatedFindingId },
      select: { id: true, status: true },
    });
    if (!cluster) throw new NotFoundError('CorrelatedFinding', req.correlatedFindingId);

    const next = req.status as FindingStatus;

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.correlatedFinding.update({
        where: { id: cluster.id },
        data: { status: next },
        select: { id: true, status: true },
      });
      await tx.findingStatusEvent.create({
        data: {
          correlatedFindingId: cluster.id,
          fromStatus: cluster.status,
          toStatus: next,
          actorId: req.actorId,
          note: req.note ?? null,
        },
      });
      return updated;
    });
  }
}
