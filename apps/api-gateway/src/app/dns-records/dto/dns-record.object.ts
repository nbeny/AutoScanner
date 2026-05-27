import { Field, ID, Int, ObjectType } from '@nestjs/graphql';
import { DnsRecordType } from './dns-record-type.enum';

@ObjectType('DnsRecord')
export class DnsRecordObject {
  @Field(() => ID)
  id!: string;

  @Field(() => ID, { nullable: true })
  domainId?: string | null;

  @Field(() => ID, { nullable: true })
  subdomainId?: string | null;

  @Field(() => DnsRecordType)
  type!: DnsRecordType;

  @Field()
  name!: string;

  @Field()
  value!: string;

  @Field(() => Int, { nullable: true })
  ttl?: number | null;

  @Field()
  firstSeenAt!: Date;

  @Field()
  lastSeenAt!: Date;
}
