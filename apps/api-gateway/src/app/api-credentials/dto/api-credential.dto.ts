import { Field, ObjectType, registerEnumType } from '@nestjs/graphql';
import { ApiProvider } from '@prisma/client';

registerEnumType(ApiProvider, { name: 'ApiProvider' });

@ObjectType('ApiCredentialInfo')
export class ApiCredentialInfo {
  @Field(() => ApiProvider)
  provider!: ApiProvider;

  @Field()
  createdAt!: Date;

  @Field()
  updatedAt!: Date;
}

export { ApiProvider };
