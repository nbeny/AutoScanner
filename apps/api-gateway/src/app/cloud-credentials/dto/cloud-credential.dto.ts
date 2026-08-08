import { Field, ObjectType, InputType, registerEnumType } from '@nestjs/graphql';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { CloudProvider } from '@autoscanner/cloud-credentials';

registerEnumType(CloudProvider, { name: 'CloudProvider' });

// InputType fields below carry class-validator decorators: the global
// ValidationPipe ({ whitelist, forbidNonWhitelisted }) rejects any undecorated
// property ("property <x> should not exist"), 400-ing the mutation. ObjectType
// (output) classes are not validated and need none.

@ObjectType('LiveCheckResult')
export class LiveCheckResultDto {
  @Field() ok!: boolean;
  @Field(() => String, { nullable: true }) principal?: string;
  @Field(() => String, { nullable: true }) error?: string;
}

@InputType('AwsCredentialInput')
export class AwsCredentialInputDto {
  @Field() @IsString() @IsNotEmpty() accessKeyId!: string;
  @Field() @IsString() @IsNotEmpty() secretAccessKey!: string;
  @Field(() => String, { nullable: true }) @IsOptional() @IsString() sessionToken?: string;
  @Field(() => String, { nullable: true }) @IsOptional() @IsString() region?: string;
}

@InputType('AzureCredentialInput')
export class AzureCredentialInputDto {
  @Field() @IsString() @IsNotEmpty() tenantId!: string;
  @Field() @IsString() @IsNotEmpty() clientId!: string;
  @Field() @IsString() @IsNotEmpty() clientSecret!: string;
  @Field(() => String, { nullable: true }) @IsOptional() @IsString() subscriptionId?: string;
}

@InputType('GcpCredentialInput')
export class GcpCredentialInputDto {
  @Field() @IsString() @IsNotEmpty() serviceAccountJson!: string;
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
