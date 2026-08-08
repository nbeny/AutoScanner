import { Field, ID, InputType, registerEnumType } from '@nestjs/graphql';
import { IsEnum, IsNotEmpty, IsString } from 'class-validator';

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

// Every field carries a class-validator decorator: the global ValidationPipe
// runs with { whitelist: true, forbidNonWhitelisted: true }, which builds its
// whitelist from class-validator metadata (not @Field). Without these the pipe
// rejects every provided property ("property <x> should not exist") and the
// mutation 400s before the resolver runs.
@InputType()
export class RunOsintScanInput {
  @Field(() => ID)
  @IsString()
  @IsNotEmpty()
  engagementId!: string;

  @Field()
  @IsString()
  @IsNotEmpty()
  seed!: string;

  @Field(() => OsintSeedTypeGql)
  @IsEnum(OsintSeedTypeGql)
  seedType!: OsintSeedType;
}
