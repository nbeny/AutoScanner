import { registerEnumType } from '@nestjs/graphql';
import { TemplateRunStatus } from '@prisma/client';

registerEnumType(TemplateRunStatus, { name: 'TemplateRunStatus' });

export { TemplateRunStatus };
