import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import type { User } from '@prisma/client';

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): User => {
    if (context.getType<'graphql' | 'http' | 'ws'>() === 'graphql') {
      const gqlCtx = GqlExecutionContext.create(context).getContext();
      return (gqlCtx.req?.user ?? gqlCtx.user) as User;
    }
    return context.switchToHttp().getRequest().user as User;
  },
);
