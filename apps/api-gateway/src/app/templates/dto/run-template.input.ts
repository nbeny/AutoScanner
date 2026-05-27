import { Field, ID, InputType } from '@nestjs/graphql';
import { IsString, MaxLength, MinLength } from 'class-validator';

@InputType()
export class RunTemplateInput {
  @Field(() => ID)
  @IsString()
  engagementId!: string;

  @Field()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  templateName!: string;

  @Field()
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  target!: string;
}
