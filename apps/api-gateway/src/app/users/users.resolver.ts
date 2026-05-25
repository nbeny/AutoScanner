import { Query, Resolver } from '@nestjs/graphql';
import { UserObject } from './dto/user.object';

@Resolver(() => UserObject)
export class UsersResolver {
  @Query(() => UserObject, { nullable: true })
  me(): UserObject | null {
    return null;
  }
}
