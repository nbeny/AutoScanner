import { IsISO8601, IsString } from 'class-validator';

export class ClaimDto {
  @IsString()
  agentId!: string;

  @IsISO8601()
  ts!: string;

  @IsString()
  signature!: string;
}
