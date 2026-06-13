import { UseGuards } from '@nestjs/common';
import { Args, ID, Query, Resolver } from '@nestjs/graphql';
import type { User } from '@prisma/client';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TlsCertificateObject } from './dto/tls-certificate.object';
import { TlsService } from './tls.service';

@Resolver()
@UseGuards(JwtAuthGuard)
export class TlsResolver {
  constructor(private readonly svc: TlsService) {}

  @Query(() => [TlsCertificateObject])
  tlsCertificates(
    @CurrentUser() user: User,
    @Args('engagementId', { type: () => ID }) engagementId: string,
  ): Promise<TlsCertificateObject[]> {
    return this.svc.tlsCertificates(user.id, engagementId);
  }
}
