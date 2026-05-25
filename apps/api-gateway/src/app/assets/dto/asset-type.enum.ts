import { registerEnumType } from '@nestjs/graphql';
import { AssetType } from '@prisma/client';

registerEnumType(AssetType, { name: 'AssetType' });

export { AssetType };
