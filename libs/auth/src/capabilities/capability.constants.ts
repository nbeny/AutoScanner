/**
 * Per-user capability flag keys. Each key is opt-in and stored in the
 * `UserCapability` table (see prisma/schema.prisma). Default is "off" for
 * every user; grants are audit-logged.
 */
export const ACTIVE_RECON_HOST_NET = 'active-recon-host-net';
export const ACTIVE_MAIL_PROBE = 'active-mail-probe';

export const ALL_CAPABILITIES = [ACTIVE_RECON_HOST_NET, ACTIVE_MAIL_PROBE] as const;

export type CapabilityKey = (typeof ALL_CAPABILITIES)[number];
