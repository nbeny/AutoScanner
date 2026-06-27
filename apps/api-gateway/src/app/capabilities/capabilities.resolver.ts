import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { CapabilityService, type CapabilityKey } from '@autoscanner/auth';

@Resolver()
export class CapabilitiesResolver {
  constructor(private readonly svc: CapabilityService) {}

  @Query(() => Boolean)
  async hasCapability(
    @Args('userId') userId: string,
    @Args('key') key: CapabilityKey,
  ): Promise<boolean> {
    return this.svc.has(userId, key);
  }

  @Mutation(() => Boolean)
  async grantCapability(
    @Args('adminUserId') adminUserId: string,
    @Args('userId') userId: string,
    @Args('key') key: CapabilityKey,
  ): Promise<boolean> {
    await this.svc.grant(adminUserId, userId, key);
    return true;
  }

  @Mutation(() => Boolean)
  async revokeCapability(
    @Args('adminUserId') adminUserId: string,
    @Args('userId') userId: string,
    @Args('key') key: CapabilityKey,
  ): Promise<boolean> {
    await this.svc.revoke(adminUserId, userId, key);
    return true;
  }
}
