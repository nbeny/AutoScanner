import { Module, ValidationPipe } from '@nestjs/common';
import { APP_PIPE } from '@nestjs/core';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { GraphQLModule } from '@nestjs/graphql';
import { join } from 'node:path';

import { AppConfigModule, AppConfigService } from '@autoscanner/config';
import { AppLoggingModule } from '@autoscanner/logging';
import { PrismaModule, PrismaService } from '@autoscanner/database';
import { StorageModule } from '@autoscanner/storage';
import { MessagingModule } from '@autoscanner/messaging';

import { authenticateWsConnection } from './auth/ws-auth';
import { formatGraphqlError } from './graphql-error.formatter';
import { AgentsModule } from './agents/agents.module';
import { ApiCredentialsModule } from './api-credentials/api-credentials.module';
import { CloudCredentialsApiModule } from './cloud-credentials/cloud-credentials.module';
import { CapabilitiesModule } from './capabilities/capabilities.module';
import { EngagementAuthModule } from './engagement-auth/engagement-auth.module';
import { AiRunsModule } from './ai-runs/ai-runs.module';
import { ChainsModule } from './chains/chains.module';
import { AuthModule } from './auth/auth.module';
import { EngagementEventsModule } from './engagement-events/engagement-events.module';
import { EngagementsModule } from './engagements/engagements.module';
import { HealthModule } from './health/health.module';
import { MetricsModule } from './metrics/metrics.module';
import { NotificationsModule } from './notifications/notifications.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { ReportsModule } from './reports/reports.module';
import { QueueHealthModule } from './queue-health/queue-health.module';
import { ScansModule } from './scans/scans.module';
import { SchedulesModule } from './schedules/schedules.module';
import { TemplatesModule } from './templates/templates.module';
import { ToolsModule } from './tools/tools.module';
import { UsersModule } from './users/users.module';
import { WebhooksModule } from './webhooks/webhooks.module';

@Module({
  imports: [
    AppConfigModule,
    AppLoggingModule,
    PrismaModule,
    StorageModule,
    MessagingModule.forRoot(),
    GraphQLModule.forRootAsync<ApolloDriverConfig>({
      driver: ApolloDriver,
      imports: [AppConfigModule, PrismaModule],
      inject: [AppConfigService, PrismaService],
      useFactory: (cfg: AppConfigService, prisma: PrismaService) => ({
        autoSchemaFile: join(process.cwd(), 'apps/api-gateway/src/schema.gql'),
        sortSchema: true,
        playground: false,
        introspection: !cfg.isProd,
        path: '/graphql',
        subscriptions: {
          'graphql-ws': {
            path: '/graphql',
            onConnect: async (ctx: {
              connectionParams?: Record<string, unknown>;
              extra?: unknown;
            }) => {
              const params = ctx.connectionParams as { authorization?: string } | undefined;
              const user = await authenticateWsConnection(params, cfg, prisma);
              // graphql-ws discards the onConnect return value: the only channel
              // to the per-operation `context` is the persistent per-socket
              // `ctx.extra`. Returning `{ user }` (as before) left `extra.user`
              // undefined, so every subscription's JwtAuthGuard fell through to
              // passport-jwt — which crashed reading `authorization` off the
              // absent HTTP request, killing the subscription after one error.
              const extra = (ctx.extra ?? (ctx.extra = {})) as Record<string, unknown>;
              extra.user = user;
              return true;
            },
          },
        },
        context: ({
          req,
          res,
          extra,
        }: {
          req?: unknown;
          res?: unknown;
          extra?: { user?: unknown };
        }) => ({ req, res, user: extra?.user }),
        formatError: formatGraphqlError,
      }),
    }),
    AgentsModule,
    ApiCredentialsModule,
    CloudCredentialsApiModule,
    CapabilitiesModule,
    EngagementAuthModule,
    AuthModule,
    EngagementEventsModule,
    EngagementsModule,
    HealthModule,
    MetricsModule,
    NotificationsModule,
    IntegrationsModule,
    ReportsModule,
    QueueHealthModule,
    ScansModule,
    AiRunsModule,
    ChainsModule,
    SchedulesModule,
    TemplatesModule,
    ToolsModule,
    UsersModule,
    WebhooksModule,
  ],
  providers: [
    {
      provide: APP_PIPE,
      useFactory: () =>
        new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    },
  ],
})
export class AppModule {}
