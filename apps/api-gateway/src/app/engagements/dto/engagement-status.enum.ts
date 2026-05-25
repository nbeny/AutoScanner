import { registerEnumType } from '@nestjs/graphql';
import { EngagementStatus } from '@prisma/client';

registerEnumType(EngagementStatus, { name: 'EngagementStatus' });

export { EngagementStatus };
