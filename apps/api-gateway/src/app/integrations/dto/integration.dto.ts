import { Field, ID, InputType, ObjectType, registerEnumType } from '@nestjs/graphql';
import { TicketProvider, TicketStatus } from '@prisma/client';

registerEnumType(TicketProvider, { name: 'TicketProvider' });
registerEnumType(TicketStatus, { name: 'TicketStatus' });

@ObjectType('IntegrationCredential')
export class IntegrationCredentialObject {
  @Field(() => ID)
  id!: string;

  @Field(() => TicketProvider)
  provider!: TicketProvider;

  @Field()
  name!: string;

  @Field()
  enabled!: boolean;

  @Field()
  createdAt!: Date;
}

@InputType()
export class CreateIntegrationCredentialInput {
  @Field(() => TicketProvider)
  provider!: TicketProvider;

  @Field()
  name!: string;

  /** Provider config as a JSON string (GitHub: {repo,token}; Jira: {baseUrl,email,token,projectKey}). */
  @Field()
  config!: string;
}

@ObjectType('Ticket')
export class TicketObject {
  @Field(() => ID)
  id!: string;

  @Field(() => TicketProvider)
  provider!: TicketProvider;

  @Field(() => TicketStatus)
  status!: TicketStatus;

  @Field()
  title!: string;

  @Field({ nullable: true })
  externalId?: string;

  @Field({ nullable: true })
  externalUrl?: string;

  @Field({ nullable: true })
  errorMessage?: string;

  @Field()
  createdAt!: Date;
}

@InputType()
export class CreateTicketInput {
  @Field(() => ID)
  correlatedFindingId!: string;

  @Field(() => TicketProvider)
  provider!: TicketProvider;
}
