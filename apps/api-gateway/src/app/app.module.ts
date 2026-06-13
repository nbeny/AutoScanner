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
import { ApiCredentialsModule } from './api-credentials/api-credentials.module';
import { AssetsModule } from './assets/assets.module';
import { AuthModule } from './auth/auth.module';
import { DnsRecordsModule } from './dns-records/dns-records.module';
import { EndpointsModule } from './endpoints/endpoints.module';
import { EngagementEventsModule } from './engagement-events/engagement-events.module';
import { EngagementsModule } from './engagements/engagements.module';
import { FindingsModule } from './findings/findings.module';
import { HealthModule } from './health/health.module';
import { InsightModule } from './insight/insight.module';
import { MetricsModule } from './metrics/metrics.module';
import { ReportsModule } from './reports/reports.module';
import { ScansModule } from './scans/scans.module';
import { TemplatesModule } from './templates/templates.module';
import { UsersModule } from './users/users.module';

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
    ApiCredentialsModule,
    AssetsModule,
    AuthModule,
    DnsRecordsModule,
    EndpointsModule,
    EngagementEventsModule,
    EngagementsModule,
    FindingsModule,
    HealthModule,
    InsightModule,
    MetricsModule,
    ReportsModule,
    ScansModule,
    TemplatesModule,
    UsersModule,
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
