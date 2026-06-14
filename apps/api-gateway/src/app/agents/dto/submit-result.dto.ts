import { IsBase64, IsInt, IsISO8601, IsString, Min } from 'class-validator';

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
  rawOutputBase64!: string;
}
