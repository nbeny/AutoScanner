import { registerEnumType } from '@nestjs/graphql';
import { ReportStatus } from '@prisma/client';

registerEnumType(ReportStatus, { name: 'ReportStatus' });

export { ReportStatus };
