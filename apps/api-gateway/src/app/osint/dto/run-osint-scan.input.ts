import { Field, ID, InputType, registerEnumType } from '@nestjs/graphql';

import type { OsintSeedType } from '../osint-presets';

/**
 * GraphQL enum backing the OSINT seed types. Values are kept in sync with the
 * `OsintSeedType` union in `osint-presets.ts` (asserted in the preset tests).
 */
export enum OsintSeedTypeGql {
  EMAIL = 'EMAIL',
  USERNAME = 'USERNAME',
  PERSON = 'PERSON',
  DOMAIN = 'DOMAIN',
}

registerEnumType(OsintSeedTypeGql, {
  name: 'OsintSeedType',
  description: 'The kind of OSINT seed being investigated.',
});

@InputType()
export class RunOsintScanInput {
  @Field(() => ID)
  engagementId!: string;

  @Field()
  seed!: string;

  @Field(() => OsintSeedTypeGql)
  seedType!: OsintSeedType;
}
