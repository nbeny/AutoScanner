import { Injectable } from '@nestjs/common';
import { addSeconds } from 'date-fns';
import {
  PasswordService,
  generateRefreshToken,
  hashRefreshToken,
  signAccessToken,
} from '@autoscanner/auth';
import { InvalidCredentialsError } from '@autoscanner/common';
import { AppConfigService } from '@autoscanner/config';
import { PrismaService } from '@autoscanner/database';
import type { AuthPayload } from './dto/login.dto';

@Injectable()
export class AuthService {
  private readonly passwordService = new PasswordService();

  constructor(
    private readonly prisma: PrismaService,
    private readonly cfg: AppConfigService,
  ) {}

  async login(
    email: string,
    password: string,
    ctx: { userAgent?: string; ip?: string },
  ): Promise<AuthPayload> {
    const user = await this.prisma.user.findFirst({
      where: { email, deletedAt: null, isActive: true },
    });
    const referenceHash =
      user?.passwordHash ??
      '$argon2id$v=19$m=65536,t=3,p=4$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
    const ok = await this.passwordService.verify(referenceHash, password);

    if (!user || !ok) {
      throw new InvalidCredentialsError();
    }

    const refreshToken = generateRefreshToken();
    const session = await this.prisma.session.create({
      data: {
        userId: user.id,
        refreshTokenHash: hashRefreshToken(refreshToken),
        userAgent: ctx.userAgent ?? null,
        ip: ctx.ip ?? null,
        expiresAt: addSeconds(new Date(), this.cfg.env.REFRESH_TOKEN_TTL_SECONDS),
      },
    });

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const accessToken = signAccessToken(
      { sub: user.id, sessionId: session.id },
      this.cfg.env.JWT_SECRET,
      this.cfg.env.ACCESS_TOKEN_TTL_SECONDS,
    );

    return {
      accessToken,
      refreshToken,
      expiresIn: this.cfg.env.ACCESS_TOKEN_TTL_SECONDS,
    };
  }

  async refresh(
    refreshToken: string,
    ctx: { userAgent?: string; ip?: string },
  ): Promise<AuthPayload> {
    const hash = hashRefreshToken(refreshToken);

    const session = await this.prisma.session.findUnique({
      where: { refreshTokenHash: hash },
      include: { user: true },
    });

    if (
      !session ||
      session.revokedAt ||
      session.expiresAt < new Date() ||
      !session.user.isActive ||
      session.user.deletedAt !== null
    ) {
      throw new InvalidCredentialsError();
    }

    const newRefresh = generateRefreshToken();
    const newSession = await this.prisma.$transaction(async (tx) => {
      await tx.session.update({
        where: { id: session.id },
        data: { revokedAt: new Date() },
      });
      return tx.session.create({
        data: {
          userId: session.userId,
          refreshTokenHash: hashRefreshToken(newRefresh),
          userAgent: ctx.userAgent ?? null,
          ip: ctx.ip ?? null,
          expiresAt: addSeconds(new Date(), this.cfg.env.REFRESH_TOKEN_TTL_SECONDS),
        },
      });
    });

    const accessToken = signAccessToken(
      { sub: session.userId, sessionId: newSession.id },
      this.cfg.env.JWT_SECRET,
      this.cfg.env.ACCESS_TOKEN_TTL_SECONDS,
    );

    return {
      accessToken,
      refreshToken: newRefresh,
      expiresIn: this.cfg.env.ACCESS_TOKEN_TTL_SECONDS,
    };
  }

  async logout(sessionId: string): Promise<void> {
    await this.prisma.session.update({
      where: { id: sessionId },
      data: { revokedAt: new Date() },
    });
  }
}
