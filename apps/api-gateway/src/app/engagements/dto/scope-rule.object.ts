import { Field, ID, ObjectType } from '@nestjs/graphql';
import { ScopeRuleType } from './scope-rule-type.enum';
import { ScopeRuleTarget } from './scope-rule-target.enum';

@ObjectType('ScopeRule')
export class ScopeRuleObject {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  engagementId!: string;

  @Field(() => ScopeRuleType)
  ruleType!: ScopeRuleType;

  @Field(() => ScopeRuleTarget)
  targetType!: ScopeRuleTarget;

  @Field()
  value!: string;

  @Field({ nullable: true })
  notes?: string;

  @Field()
  createdAt!: Date;
}
