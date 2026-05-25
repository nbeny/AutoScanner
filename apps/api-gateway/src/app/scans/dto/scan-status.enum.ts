import { registerEnumType } from '@nestjs/graphql';
import { ScanStatus } from '@prisma/client';

registerEnumType(ScanStatus, { name: 'ScanStatus' });

export { ScanStatus };
