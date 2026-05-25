import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AppConfigService } from '@autoscanner/config';
import { PrismaService } from '@autoscanner/database';
import type { User } from '@prisma/client';

interface JwtPayload {
  sub: string;
  sessionId: string;
  iat: number;
  exp: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    cfg: AppConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: cfg.env.JWT_SECRET,
      algorithms: ['HS512'],
    });
  }

  async validate(payload: JwtPayload): Promise<User> {
    const [session, user] = await Promise.all([
      this.prisma.session.findUnique({ where: { id: payload.sessionId } }),
      this.prisma.user.findFirst({
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
}
