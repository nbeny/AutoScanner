import { registerEnumType } from '@nestjs/graphql';
import { Protocol } from '@prisma/client';

registerEnumType(Protocol, { name: 'Protocol' });

export { Protocol };
