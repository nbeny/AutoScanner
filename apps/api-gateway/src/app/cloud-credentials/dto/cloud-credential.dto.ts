import { Field, ObjectType, InputType, registerEnumType } from '@nestjs/graphql';
import { CloudProvider } from '@autoscanner/cloud-credentials';

registerEnumType(CloudProvider, { name: 'CloudProvider' });

@ObjectType('LiveCheckResult')
export class LiveCheckResultDto {
  @Field() ok!: boolean;
  @Field({ nullable: true }) principal?: string;
  @Field({ nullable: true }) error?: string;
}

@InputType('AwsCredentialInput')
export class AwsCredentialInputDto {
  @Field() accessKeyId!: string;
  @Field() secretAccessKey!: string;
  @Field({ nullable: true }) sessionToken?: string;
  @Field({ nullable: true }) region?: string;
}

@InputType('AzureCredentialInput')
export class AzureCredentialInputDto {
  @Field() tenantId!: string;
  @Field() clientId!: string;
  @Field() clientSecret!: string;
  @Field({ nullable: true }) subscriptionId?: string;
}

@InputType('GcpCredentialInput')
export class GcpCredentialInputDto {
  @Field() serviceAccountJson!: string;
}

@ObjectType('AwsCredentialInfo')
export class AwsCredentialInfoDto {
  @Field({ nullable: true }) principal?: string | null;
  @Field({ nullable: true }) accountId?: string | null;
  @Field({ nullable: true }) region?: string | null;
  @Field() createdAt!: Date;
  @Field() updatedAt!: Date;
}

@ObjectType('AzureCredentialInfo')
export class AzureCredentialInfoDto {
  @Field() principal!: string;
  @Field({ nullable: true }) subscriptionName?: string | null;
  @Field() createdAt!: Date;
  @Field() updatedAt!: Date;
}

@ObjectType('GcpCredentialInfo')
export class GcpCredentialInfoDto {
  @Field() principal!: string;
  @Field({ nullable: true }) projectId?: string | null;
  @Field() createdAt!: Date;
  @Field() updatedAt!: Date;
}

export { CloudProvider };
