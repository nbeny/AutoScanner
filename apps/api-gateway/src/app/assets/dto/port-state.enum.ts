import { registerEnumType } from '@nestjs/graphql';
import { PortState } from '@prisma/client';

registerEnumType(PortState, { name: 'PortState' });

export { PortState };
