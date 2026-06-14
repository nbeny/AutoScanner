import { IsBase64, IsInt, IsISO8601, IsString, MaxLength, Min } from 'class-validator';

export class SubmitResultDto {
  @IsString()
  agentId!: string;

  @IsISO8601()
  ts!: string;

  @IsString()
  signature!: string;

  @IsInt()
  @Min(0)
  exitCode!: number;

  @IsBase64()
  @MaxLength(13_421_772)
  rawOutputBase64!: string;
}
