import { Field, ObjectType } from '@nestjs/graphql';

/** Non-executing preview of the command a scanner would run (image + argv). */
@ObjectType()
export class ScanCommandPreview {
  @Field() image!: string;
  @Field(() => [String]) argv!: string[];
  /** Human note when the preview is partial (bad options, missing credential…). */
  @Field(() => String, { nullable: true }) note?: string | null;
}
