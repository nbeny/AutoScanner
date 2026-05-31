import type { ObservationKind, Prisma, PrismaClient } from '@prisma/client';

export type ObservationWriterClient = PrismaClient | Prisma.TransactionClient;

export interface WriteObservationInput {
  assetId: string;
  scanJobId: string;
  scannerName: string;
  kind: ObservationKind;
  payload?: Prisma.InputJsonValue;
}

/**
 * Pure write helper for AssetObservation rows.
 *
 * Caller passes either a PrismaClient or a TransactionClient. The parser-worker
 * passes a TransactionClient so the observation row lands atomically with the
 * persister upsert that produced it. Returns the new row id.
 */
export async function writeObservation(
  client: ObservationWriterClient,
  input: WriteObservationInput,
): Promise<string> {
  const row = await client.assetObservation.create({
    data: {
      assetId: input.assetId,
      scanJobId: input.scanJobId,
      scannerName: input.scannerName,
      kind: input.kind,
      payload: input.payload,
    },
    select: { id: true },
  });
  return row.id;
}
