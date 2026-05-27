import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { AssetsResolver } from './assets.resolver';
import { AssetsService } from './assets.service';
import { UnifiedAssetsResolver } from './unified-assets.resolver';
import { UnifiedAssetsService } from './unified-assets.service';

import './dto/asset-type.enum';
import './dto/port-state.enum';
import './dto/protocol.enum';
import './unified-asset.dto';

@Module({
  imports: [AuthModule],
  providers: [AssetsService, AssetsResolver, UnifiedAssetsService, UnifiedAssetsResolver],
})
export class AssetsModule {}
