import { registerEnumType } from '@nestjs/graphql';
import { ScopeRuleTarget } from '@prisma/client';

registerEnumType(ScopeRuleTarget, { name: 'ScopeRuleTarget' });

export { ScopeRuleTarget };
