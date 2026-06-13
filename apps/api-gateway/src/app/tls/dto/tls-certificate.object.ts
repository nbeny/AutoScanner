import { Field, ID, ObjectType } from '@nestjs/graphql';

@ObjectType('TlsCertificate')
export class TlsCertificateObject {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  engagementId!: string;

  @Field()
  host!: string;

  @Field({ nullable: true })
  subjectCn?: string | null;

  @Field(() => [String])
  subjectAn!: string[];

  @Field({ nullable: true })
  issuerCn?: string | null;

  @Field(() => Date, { nullable: true })
  notBefore?: Date | null;

  @Field(() => Date, { nullable: true })
  notAfter?: Date | null;

  @Field()
  fingerprintSha256!: string;

  @Field({ nullable: true })
  tlsVersion?: string | null;

  @Field()
  selfSigned!: boolean;

  @Field()
  expired!: boolean;

  @Field()
  source!: string;

  @Field()
  firstSeenAt!: Date;

  @Field()
  lastSeenAt!: Date;
}
