import { Module, ValidationPipe } from '@nestjs/common';
import { APP_PIPE } from '@nestjs/core';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { GraphQLModule } from '@nestjs/graphql';
import { join } from 'node:path';

import { AppConfigModule, AppConfigService } from '@autoscanner/config';
import { AppLoggingModule } from '@autoscanner/logging';
import { PrismaModule, PrismaService } from '@autoscanner/database';
import { StorageModule } from '@autoscanner/storage';

import { authenticateWsConnection } from './auth/ws-auth';
import { formatGraphqlError } from './graphql-error.formatter';
import { AgentsModule } from './agents/agents.module';
import { ApiCredentialsModule } from './api-credentials/api-credentials.module';
import { CloudCredentialsApiModule } from './cloud-credentials/cloud-credentials.module';
import { CapabilitiesModule } from './capabilities/capabilities.module';
import { EngagementAuthModule } from './engagement-auth/engagement-auth.module';
import { AssetsModule } from './assets/assets.module';
import { AuthModule } from './auth/auth.module';
import { CorrelatedFindingsModule } from './correlated-findings/correlated-findings.module';
import { DnsRecordsModule } from './dns-records/dns-records.module';
import { EndpointsModule } from './endpoints/endpoints.module';
import { EngagementEventsModule } from './engagement-events/engagement-events.module';
import { EngagementsModule } from './engagements/engagements.module';
import { FindingsModule } from './findings/findings.module';
import { HealthModule } from './health/health.module';
import { InsightModule } from './insight/insight.module';
import { OsintModule } from './osint/osint.module';
import { MetricsModule } from './metrics/metrics.module';
import { NotificationsModule } from './notifications/notifications.module';
import { TlsModule } from './tls/tls.module';
import { ReportsModule } from './reports/reports.module';
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
            onConnect: async (ctx: { connectionParams?: Record<string, unknown> }) => {
              const params = ctx.connectionParams as { authorization?: string } | undefined;
              const user = await authenticateWsConnection(params, cfg, prisma);
              return { user };
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
    AssetsModule,
    AuthModule,
    CorrelatedFindingsModule,
    DnsRecordsModule,
    EndpointsModule,
    EngagementEventsModule,
    EngagementsModule,
    FindingsModule,
    HealthModule,
    InsightModule,
    MetricsModule,
    NotificationsModule,
    OsintModule,
    ReportsModule,
    TlsModule,
    ScansModule,
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
