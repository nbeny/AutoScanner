import { Field, InputType, ObjectType } from '@nestjs/graphql';
import { IsArray, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

// InputType fields carry class-validator decorators: the global ValidationPipe
// ({ whitelist, forbidNonWhitelisted }) rejects any undecorated property
// ("property <x> should not exist"), 400-ing the mutation before it resolves.
@InputType('EngagementAuthHeaderInput')
export class EngagementAuthHeaderInput {
  @Field()
  @IsString()
  name!: string;

  @Field()
  @IsString()
  value!: string;
}

@InputType('EngagementAuthInput')
export class EngagementAuthInput {
  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  cookie?: string;

  @Field(() => [EngagementAuthHeaderInput], { nullable: true })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EngagementAuthHeaderInput)
  headers?: EngagementAuthHeaderInput[];
}

@ObjectType('EngagementAuthStatus')
export class EngagementAuthStatus {
  /** Whether an auth profile is configured — the sealed secret is never exposed. */
  @Field()
  configured!: boolean;

  @Field({ nullable: true })
  updatedAt?: Date;
}
