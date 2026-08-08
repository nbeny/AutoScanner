import { Field, InputType, Int } from '@nestjs/graphql';
import { IsInt, IsOptional, Min } from 'class-validator';

// The `days` field carries class-validator decorators: the global ValidationPipe
// ({ whitelist, forbidNonWhitelisted }) rejects any undecorated property
// ("property days should not exist"), 400-ing the query before it resolves.
@InputType()
export class TrendRangeInput {
  @Field(() => Int, { nullable: true }) @IsOptional() @IsInt() @Min(1) days?: number;
}
