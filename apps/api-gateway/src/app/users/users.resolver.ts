import { UseGuards } from '@nestjs/common';
import { Query, Resolver } from '@nestjs/graphql';
import type { User } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UserObject } from './dto/user.object';

@Resolver(() => UserObject)
export class UsersResolver {
  @Query(() => UserObject)
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: User): UserObject {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName ?? undefined,
      isActive: user.isActive,
      totpEnabled: user.totpEnabled,
      createdAt: user.createdAt,
    };
  }
}
