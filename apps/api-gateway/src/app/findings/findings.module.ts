import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { FindingsResolver } from './findings.resolver';
import { FindingsService } from './findings.service';

import './dto/severity.enum';

@Module({
  imports: [AuthModule],
  providers: [FindingsService, FindingsResolver],
})
export class FindingsModule {}
