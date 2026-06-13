import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { TlsResolver } from './tls.resolver';
import { TlsService } from './tls.service';

@Module({
  imports: [AuthModule],
  providers: [TlsResolver, TlsService],
})
export class TlsModule {}
