import { Field, ID, InputType } from '@nestjs/graphql';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

@InputType()
export class RunScanInput {
  @Field(() => ID)
  @IsString()
  engagementId!: string;

  @Field()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  scannerName!: string;

  @Field()
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  target!: string;

  @Field({ nullable: true, description: 'JSON-encoded scanner-specific options' })
  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  optionsJson?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;
}
