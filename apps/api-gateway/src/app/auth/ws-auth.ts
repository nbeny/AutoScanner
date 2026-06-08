import { UnauthorizedException } from '@nestjs/common';
import jwt from 'jsonwebtoken';
import type { User } from '@prisma/client';

import { AppConfigService } from '@autoscanner/config';
import { PrismaService } from '@autoscanner/database';

interface JwtPayload {
  sub: string;
  sessionId: string;
}

export interface WsConnectionParams {
  authorization?: string;
}

export async function authenticateWsConnection(
  params: WsConnectionParams | undefined,
  cfg: AppConfigService,
  prisma: PrismaService,
): Promise<User> {
  const header = params?.authorization;
  if (!header || !header.toLowerCase().startsWith('bearer ')) {
    throw new UnauthorizedException('Missing Bearer token');
  }
  const token = header.slice(7).trim();

  let payload: JwtPayload;
  try {
    payload = jwt.verify(token, cfg.env.JWT_SECRET, {
      algorithms: ['HS512'],
    }) as JwtPayload;
  } catch {
    throw new UnauthorizedException('Invalid JWT');
  }
  if (typeof payload.sub !== 'string' || typeof payload.sessionId !== 'string') {
    throw new UnauthorizedException('JWT missing required claims');
  }

  const [session, user] = await Promise.all([
    prisma.session.findUnique({ where: { id: payload.sessionId } }),
    prisma.user.findFirst({
      where: { id: payload.sub, deletedAt: null, isActive: true },
    }),
  ]);

  if (!session || session.revokedAt || session.expiresAt < new Date()) {
    throw new UnauthorizedException('session not active');
  }
  if (!user) {
    throw new UnauthorizedException('user not found');
  }

  return user;
}
