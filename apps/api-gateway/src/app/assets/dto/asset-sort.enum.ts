import { registerEnumType } from '@nestjs/graphql';

export enum AssetSort {
  RISK_SCORE = 'RISK_SCORE',
  FIRST_SEEN_AT = 'FIRST_SEEN_AT',
  LAST_SEEN_AT = 'LAST_SEEN_AT',
  CANONICAL_VALUE = 'CANONICAL_VALUE',
}

registerEnumType(AssetSort, { name: 'AssetSort' });
