import { Field, ID, InputType } from '@nestjs/graphql';
import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ScopeRuleType } from './scope-rule-type.enum';
import { ScopeRuleTarget } from './scope-rule-target.enum';

@InputType()
export class CreateScopeRuleInput {
  @Field(() => ID)
  @IsString()
  engagementId!: string;

  @Field(() => ScopeRuleType)
  @IsEnum(ScopeRuleType)
  ruleType!: ScopeRuleType;

  @Field(() => ScopeRuleTarget)
  @IsEnum(ScopeRuleTarget)
  targetType!: ScopeRuleTarget;

  @Field()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  value!: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
