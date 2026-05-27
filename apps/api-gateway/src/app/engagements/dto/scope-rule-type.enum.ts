import { registerEnumType } from '@nestjs/graphql';
import { ScopeRuleType } from '@prisma/client';

registerEnumType(ScopeRuleType, { name: 'ScopeRuleType' });

export { ScopeRuleType };
