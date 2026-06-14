import { IsISO8601, IsOptional, IsString } from 'class-validator';

export class HeartbeatDto {
  @IsString()
  agentId!: string;

  @IsISO8601()
  ts!: string;

  @IsString()
  signature!: string;

  @IsOptional()
  capabilities?: unknown;
}
