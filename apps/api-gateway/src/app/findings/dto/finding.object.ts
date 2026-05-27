import { Field, ID, ObjectType } from '@nestjs/graphql';
import { Severity } from './severity.enum';

@ObjectType('Finding')
export class FindingObject {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  assetId!: string;

  @Field(() => ID)
  scanJobId!: string;

  @Field()
  title!: string;

  @Field(() => Severity)
  severity!: Severity;

  @Field({ nullable: true })
  location?: string | null;

  @Field({ nullable: true })
  cveId?: string | null;

  @Field({ nullable: true })
  templateId?: string | null;

  @Field()
  firstSeenAt!: Date;

  @Field()
  lastSeenAt!: Date;
}
