import { registerEnumType } from '@nestjs/graphql';
import { Severity } from '@prisma/client';

registerEnumType(Severity, { name: 'Severity' });

export { Severity };
