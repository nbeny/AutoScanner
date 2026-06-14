import { IsBase64, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class EnrollDto {
  @IsString()
  bootstrapToken!: string;

  @IsString()
  @MinLength(1)
  @IsBase64()
  @MaxLength(256)
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
