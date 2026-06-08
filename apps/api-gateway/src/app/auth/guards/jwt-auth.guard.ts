import { ExecutionContext, Injectable } from '@nestjs/common';
import { GqlContextType, GqlExecutionContext } from '@nestjs/graphql';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  override canActivate(context: ExecutionContext) {
    if (context.getType<GqlContextType>() === 'graphql') {
      const info = GqlExecutionContext.create(context).getInfo<{
        operation?: { operation?: string };
      }>();
      const gqlCtx = GqlExecutionContext.create(context).getContext<{
        user?: unknown;
      }>();
      if (info?.operation?.operation === 'subscription' && gqlCtx.user) {
        return true;
      }
    }
    return super.canActivate(context);
  }

  override getRequest(context: ExecutionContext) {
    if (context.getType<GqlContextType>() === 'graphql') {
      const gqlCtx = GqlExecutionContext.create(context);
      return gqlCtx.getContext().req;
    }
    return context.switchToHttp().getRequest();
  }
}
