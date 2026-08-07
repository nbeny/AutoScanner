import { Field, ID, InputType } from '@nestjs/graphql';
import { ArrayMaxSize, IsArray, IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

@InputType()
export class RunKaliToolInput {
  @Field(() => ID) @IsString() engagementId!: string;
  @Field() @IsString() binary!: string;
  @Field(() => [String])
  @IsArray()
  @ArrayMaxSize(40)
  @IsString({ each: true })
  @MaxLength(2048, { each: true })
  args!: string[];
  @Field({ nullable: true }) @IsOptional() @IsBoolean() jsonOutput?: boolean;
}
