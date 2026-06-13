import { Field, ID, ObjectType, registerEnumType } from '@nestjs/graphql';
import { OrgMetadataKind } from '@prisma/client';
import GraphQLJSON from 'graphql-type-json';

registerEnumType(OrgMetadataKind, { name: 'OrgMetadataKind' });

@ObjectType('OrgMetadata')
export class OrgMetadataObject {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  engagementId!: string;

  @Field(() => OrgMetadataKind)
  kind!: OrgMetadataKind;

  @Field(() => GraphQLJSON)
  data!: unknown;

  @Field()
  source!: string;

  @Field()
  firstSeenAt!: Date;

  @Field()
  lastSeenAt!: Date;
}
