import { IsOptional, IsString, MinLength } from 'class-validator';

export class EnrollDto {
  @IsString()
  bootstrapToken!: string;

  @IsString()
  @MinLength(1)
  publicKey!: string;

  @IsOptional()
  @IsString()
  hostname?: string;

  @IsOptional()
  @IsString()
  version?: string;

  @IsOptional()
  capabilities?: unknown;
}
