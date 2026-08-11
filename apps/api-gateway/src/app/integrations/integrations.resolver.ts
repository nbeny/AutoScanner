import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import type { User } from '@prisma/client';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { IntegrationsService } from './integrations.service';
import {
  CreateIntegrationCredentialInput,
  IntegrationCredentialObject,
} from './dto/integration.dto';

@Resolver()
@UseGuards(JwtAuthGuard)
export class IntegrationsResolver {
  constructor(private readonly svc: IntegrationsService) {}

  @Query(() => [IntegrationCredentialObject])
  integrationCredentials(@CurrentUser() user: User): Promise<IntegrationCredentialObject[]> {
    return this.svc.listCredentials(user.id) as Promise<IntegrationCredentialObject[]>;
  }

  @Mutation(() => IntegrationCredentialObject)
  createIntegrationCredential(
    @CurrentUser() user: User,
    @Args('input') input: CreateIntegrationCredentialInput,
  ): Promise<IntegrationCredentialObject> {
    return this.svc.createCredential(user.id, input) as Promise<IntegrationCredentialObject>;
  }
}
