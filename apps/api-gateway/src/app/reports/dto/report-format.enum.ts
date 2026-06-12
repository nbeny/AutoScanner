import { registerEnumType } from '@nestjs/graphql';
import { ReportFormat } from '@prisma/client';

registerEnumType(ReportFormat, { name: 'ReportFormat' });

export { ReportFormat };
