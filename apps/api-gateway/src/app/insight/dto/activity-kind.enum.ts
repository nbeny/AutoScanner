import { registerEnumType } from '@nestjs/graphql';

export enum ActivityKind {
  TEMPLATE_RUN = 'TEMPLATE_RUN',
  SCAN = 'SCAN',
}

registerEnumType(ActivityKind, { name: 'ActivityKind' });
