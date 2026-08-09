import { Field, Float, ObjectType } from '@nestjs/graphql';
import GraphQLJSON from 'graphql-type-json';

@ObjectType()
export class ScannerFieldObject {
  @Field() name!: string;
  /** One of: string | number | boolean | enum | string[] | number[] | enum[] | unknown. */
  @Field() type!: string;
  @Field() required!: boolean;
  @Field(() => GraphQLJSON, { nullable: true }) default?: unknown;
  @Field(() => Float, { nullable: true }) min?: number | null;
  @Field(() => Float, { nullable: true }) max?: number | null;
  @Field(() => [String], { nullable: true }) enumValues?: string[] | null;
  @Field(() => String, { nullable: true }) description?: string | null;
}

@ObjectType()
export class ScannerCatalogEntryObject {
  @Field() name!: string;
  @Field() displayName!: string;
  @Field() description!: string;
  @Field(() => [String]) categories!: string[];
  @Field(() => String, { nullable: true }) primaryCategory?: string | null;
  @Field(() => String, { nullable: true }) requiresCredential?: string | null;
  @Field(() => String, { nullable: true }) kaliToolRef?: string | null;
  @Field(() => [ScannerFieldObject]) fields!: ScannerFieldObject[];
  @Field(() => GraphQLJSON, { nullable: true }) presets?: unknown;
}
