import { Field, Int, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class ScannerUsageStat {
  /** Combinaison d'options normalisée (JSON trié), '' pour « aucune option ». */
  @Field() optionsJson!: string;
  @Field(() => Int) count!: number;
}
