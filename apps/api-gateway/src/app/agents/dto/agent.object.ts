import { Field, ID, ObjectType, registerEnumType } from '@nestjs/graphql';
import { AgentStatus } from '@prisma/client';
import GraphQLJSON from 'graphql-type-json';

registerEnumType(AgentStatus, { name: 'AgentStatus' });

/**
 * GraphQL projection for an Agent.
 * SECURITY: publicKey and registrationToken are intentionally omitted.
 */
@ObjectType('Agent')
export class AgentObject {
  @Field(() => ID)
  id!: string;

  @Field()
  name!: string;

  @Field({ nullable: true })
  hostname?: string | null;

  @Field(() => AgentStatus)
  status!: AgentStatus;

  @Field(() => GraphQLJSON, { nullable: true })
  capabilities?: unknown;

  @Field({ nullable: true })
  version?: string | null;

  @Field(() => Date, { nullable: true })
  lastHeartbeatAt?: Date | null;

  @Field(() => Date, { nullable: true })
  enrolledAt?: Date | null;

  @Field(() => ID)
  createdById!: string;

  @Field()
  createdAt!: Date;

  @Field()
  updatedAt!: Date;
}
