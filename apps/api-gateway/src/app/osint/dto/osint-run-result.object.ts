import { Field, ID, Int, ObjectType } from '@nestjs/graphql';

import type { OsintSeedType } from '../osint-presets';
import { OsintSeedTypeGql } from './run-osint-scan.input';

@ObjectType('OsintLaunch')
export class OsintLaunchObject {
  @Field()
  scannerName!: string;

  @Field(() => ID)
  scanId!: string;
}

@ObjectType('OsintRunResult')
export class OsintRunResultObject {
  @Field()
  seed!: string;

  @Field(() => OsintSeedTypeGql)
  seedType!: OsintSeedType;

  @Field(() => Int)
  count!: number;

  @Field(() => [OsintLaunchObject])
  launches!: OsintLaunchObject[];
}
