import { registerEnumType } from '@nestjs/graphql';
import { FindingStatus } from '@prisma/client';

registerEnumType(FindingStatus, { name: 'FindingStatus' });

export { FindingStatus };
