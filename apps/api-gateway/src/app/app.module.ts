import { Module, ValidationPipe } from '@nestjs/common';
import { APP_PIPE } from '@nestjs/core';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { GraphQLModule } from '@nestjs/graphql';
import { join } from 'node:path';

import { AppConfigModule, AppConfigService } from '@autoscanner/config';
import { AppLoggingModule } from '@autoscanner/logging';
import { PrismaModule } from '@autoscanner/database';
import { StorageModule } from '@autoscanner/storage';

import { formatGraphqlError } from './graphql-error.formatter';
import { AssetsModule } from './assets/assets.module';
import { AuthModule } from './auth/auth.module';
import { EngagementsModule } from './engagements/engagements.module';
import { HealthModule } from './health/health.module';
import { MetricsModule } from './metrics/metrics.module';
import { ScansModule } from './scans/scans.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    AppConfigModule,
    AppLoggingModule,
    PrismaModule,
    StorageModule,
    GraphQLModule.forRootAsync<ApolloDriverConfig>({
      driver: ApolloDriver,
      imports: [AppConfigModule],
      inject: [AppConfigService],
      useFactory: (cfg: AppConfigService) => ({
        autoSchemaFile: join(process.cwd(), 'apps/api-gateway/src/schema.gql'),
        sortSchema: true,
        playground: false,
        introspection: !cfg.isProd,
        path: '/graphql',
        subscriptions: {
          'graphql-ws': { path: '/graphql' },
        },
        context: ({ req, res }: { req: unknown; res: unknown }) => ({ req, res }),
        formatError: formatGraphqlError,
      }),
    }),
    AssetsModule,
    AuthModule,
    EngagementsModule,
    HealthModule,
    MetricsModule,
    ScansModule,
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
