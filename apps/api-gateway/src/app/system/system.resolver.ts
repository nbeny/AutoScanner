import { Query, Resolver } from '@nestjs/graphql';

@Resolver()
export class SystemResolver {
  @Query(() => String)
  version(): string {
    return 'autoscanner-api-gateway@0.0.0';
  }
}
