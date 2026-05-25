import { IncomingMessage } from 'node:http';
import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { AppConfigModule, AppConfigService } from '@autoscanner/config';
import { buildPinoOptions } from './logger.factory';

@Module({
  imports: [
    AppConfigModule,
    LoggerModule.forRootAsync({
      imports: [AppConfigModule],
      inject: [AppConfigService],
      useFactory: (cfg: AppConfigService) => ({
        pinoHttp: {
          ...buildPinoOptions({
            level: cfg.env.LOG_LEVEL,
            pretty: cfg.env.LOG_PRETTY,
            env: cfg.env.NODE_ENV,
            appName: 'api-gateway',
          }),
          customProps: (req: IncomingMessage) => {
            const id = (req as IncomingMessage & { id?: string | number }).id;
            return { reqId: id !== undefined ? String(id) : undefined };
          },
        },
      }),
    }),
  ],
  exports: [LoggerModule],
})
export class AppLoggingModule {}
