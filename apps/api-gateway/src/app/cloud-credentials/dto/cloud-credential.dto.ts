import { Field, ObjectType, InputType, registerEnumType } from '@nestjs/graphql';
import { CloudProvider } from '@autoscanner/cloud-credentials';

registerEnumType(CloudProvider, { name: 'CloudProvider' });

@ObjectType('LiveCheckResult')
export class LiveCheckResultDto {
  @Field() ok!: boolean;
  @Field(() => String, { nullable: true }) principal?: string;
  @Field(() => String, { nullable: true }) error?: string;
}

@InputType('AwsCredentialInput')
export class AwsCredentialInputDto {
  @Field() accessKeyId!: string;
  @Field() secretAccessKey!: string;
  @Field(() => String, { nullable: true }) sessionToken?: string;
  @Field(() => String, { nullable: true }) region?: string;
}

@InputType('AzureCredentialInput')
export class AzureCredentialInputDto {
  @Field() tenantId!: string;
  @Field() clientId!: string;
  @Field() clientSecret!: string;
  @Field(() => String, { nullable: true }) subscriptionId?: string;
}

@InputType('GcpCredentialInput')
export class GcpCredentialInputDto {
  @Field() serviceAccountJson!: string;
}

@ObjectType('AwsCredentialInfo')
export class AwsCredentialInfoDto {
  @Field(() => String, { nullable: true }) principal?: string | null;
  @Field(() => String, { nullable: true }) accountId?: string | null;
  @Field(() => String, { nullable: true }) region?: string | null;
  @Field() createdAt!: Date;
  @Field() updatedAt!: Date;
}

@ObjectType('AzureCredentialInfo')
export class AzureCredentialInfoDto {
  @Field() principal!: string;
  @Field(() => String, { nullable: true }) subscriptionName?: string | null;
  @Field() createdAt!: Date;
  @Field() updatedAt!: Date;
}

@ObjectType('GcpCredentialInfo')
export class GcpCredentialInfoDto {
  @Field() principal!: string;
  @Field(() => String, { nullable: true }) projectId?: string | null;
  @Field() createdAt!: Date;
  @Field() updatedAt!: Date;
}

export { CloudProvider };
