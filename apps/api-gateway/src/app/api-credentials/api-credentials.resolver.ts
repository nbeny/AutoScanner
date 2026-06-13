import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import type { User } from '@prisma/client';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ApiCredentialsService } from './api-credentials.service';
import { ApiCredentialInfo, ApiProvider } from './dto/api-credential.dto';

@Resolver()
@UseGuards(JwtAuthGuard)
export class ApiCredentialsResolver {
  constructor(private readonly svc: ApiCredentialsService) {}

  @Mutation(() => Boolean)
  setApiCredential(
    @CurrentUser() user: User,
    @Args('provider', { type: () => ApiProvider }) provider: ApiProvider,
    @Args('secret') secret: string,
  ): Promise<boolean> {
    return this.svc.set(user.id, provider, secret);
  }

  @Mutation(() => Boolean)
  deleteApiCredential(
    @CurrentUser() user: User,
    @Args('provider', { type: () => ApiProvider }) provider: ApiProvider,
  ): Promise<boolean> {
    return this.svc.delete(user.id, provider);
  }

  @Query(() => [ApiCredentialInfo])
  apiCredentials(@CurrentUser() user: User): Promise<ApiCredentialInfo[]> {
    return this.svc.list(user.id);
  }
}
