import { registerEnumType } from '@nestjs/graphql';
import { DeliveryStatus, NotificationChannelType } from '@prisma/client';

registerEnumType(NotificationChannelType, { name: 'NotificationChannelType' });
registerEnumType(DeliveryStatus, { name: 'DeliveryStatus' });

export { NotificationChannelType, DeliveryStatus };
