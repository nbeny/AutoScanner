import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { ScansModule } from '../scans/scans.module';
import { OsintResolver } from './osint.resolver';
import { OsintService } from './osint.service';

import './dto/run-osint-scan.input';

@Module({
  imports: [AuthModule, ScansModule],
  providers: [OsintResolver, OsintService],
})
export class OsintModule {}
