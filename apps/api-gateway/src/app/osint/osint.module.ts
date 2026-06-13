import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { OsintResolver } from './osint.resolver';
import { OsintService } from './osint.service';

@Module({
  imports: [AuthModule],
  providers: [OsintResolver, OsintService],
})
export class OsintModule {}
