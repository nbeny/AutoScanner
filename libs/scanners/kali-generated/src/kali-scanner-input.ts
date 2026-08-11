import { z } from 'zod';

/** Shared generic input for every generated Kali scanner. */
export const KaliScannerInput = z.object({
  target: z.string().optional(),
  args: z.string().optional(),
  preset: z.string().optional(),
});

export type KaliScannerInputType = z.infer<typeof KaliScannerInput>;
