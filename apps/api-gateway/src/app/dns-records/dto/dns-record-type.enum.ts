import { registerEnumType } from '@nestjs/graphql';
import { DnsRecordType } from '@prisma/client';

registerEnumType(DnsRecordType, { name: 'DnsRecordType' });

export { DnsRecordType };
