import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { AssetsResolver } from './assets.resolver';
import { AssetsService } from './assets.service';

import './dto/asset-type.enum';
import './dto/port-state.enum';
import './dto/protocol.enum';

@Module({
  imports: [AuthModule],
  providers: [AssetsService, AssetsResolver],
})
export class AssetsModule {}
