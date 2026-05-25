import { Field, ID, ObjectType, registerEnumType } from '@nestjs/graphql';

export enum LogStreamKind {
  STDOUT = 'STDOUT',
  STDERR = 'STDERR',
}

registerEnumType(LogStreamKind, { name: 'LogStream' });

@ObjectType('ScanLogChunk')
export class ScanLogChunkObject {
  @Field(() => ID)
  scanJobId!: string;

  @Field(() => LogStreamKind)
  stream!: LogStreamKind;

  @Field()
  ts!: number;

  @Field()
  chunk!: string;
}
