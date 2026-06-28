import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import type { User } from '@prisma/client';
import {
  AwsCredentialsService,
  AzureCredentialsService,
  GcpCredentialsService,
  CloudProvider,
} from '@autoscanner/cloud-credentials';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  AwsCredentialInfoDto,
  AwsCredentialInputDto,
  AzureCredentialInfoDto,
  AzureCredentialInputDto,
  GcpCredentialInfoDto,
  GcpCredentialInputDto,
  LiveCheckResultDto,
} from './dto/cloud-credential.dto';

@Resolver()
@UseGuards(JwtAuthGuard)
export class CloudCredentialsResolver {
  constructor(
    private readonly aws: AwsCredentialsService,
    private readonly azure: AzureCredentialsService,
    private readonly gcp: GcpCredentialsService,
  ) {}

  @Mutation(() => LiveCheckResultDto)
  setAwsCredential(
    @CurrentUser() user: User,
    @Args('input') input: AwsCredentialInputDto,
  ): Promise<LiveCheckResultDto> {
    return this.aws.set(user.id, input);
  }

  @Mutation(() => LiveCheckResultDto)
  setAzureCredential(
    @CurrentUser() user: User,
    @Args('input') input: AzureCredentialInputDto,
  ): Promise<LiveCheckResultDto> {
    return this.azure.set(user.id, input);
  }

  @Mutation(() => LiveCheckResultDto)
  setGcpCredential(
    @CurrentUser() user: User,
    @Args('input') input: GcpCredentialInputDto,
  ): Promise<LiveCheckResultDto> {
    return this.gcp.set(user.id, input);
  }

  @Mutation(() => Boolean)
  async deleteCloudCredential(
    @CurrentUser() user: User,
    @Args('provider', { type: () => CloudProvider }) provider: CloudProvider,
  ): Promise<boolean> {
    if (provider === CloudProvider.AWS) return this.aws.delete(user.id);
    if (provider === CloudProvider.AZURE) return this.azure.delete(user.id);
    return this.gcp.delete(user.id);
  }

  @Query(() => LiveCheckResultDto)
  cloudCredentialLiveCheck(
    @CurrentUser() user: User,
    @Args('provider', { type: () => CloudProvider }) provider: CloudProvider,
  ): Promise<LiveCheckResultDto> {
    if (provider === CloudProvider.AWS) return this.aws.liveCheck(user.id);
    if (provider === CloudProvider.AZURE) return this.azure.liveCheck(user.id);
    return this.gcp.liveCheck(user.id);
  }

  @Query(() => AwsCredentialInfoDto, { nullable: true })
  awsCredential(@CurrentUser() user: User): Promise<AwsCredentialInfoDto | null> {
    return this.aws.list(user.id);
  }

  @Query(() => AzureCredentialInfoDto, { nullable: true })
  azureCredential(@CurrentUser() user: User): Promise<AzureCredentialInfoDto | null> {
    return this.azure.list(user.id);
  }

  @Query(() => GcpCredentialInfoDto, { nullable: true })
  gcpCredential(@CurrentUser() user: User): Promise<GcpCredentialInfoDto | null> {
    return this.gcp.list(user.id);
  }
}
