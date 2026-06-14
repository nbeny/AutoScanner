import {
  Body,
  Controller,
  HttpCode,
  HttpException,
  Ip,
  Param,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { NotFoundError, ConflictError, ValidationError } from '@autoscanner/common';
import { AgentsService } from './agents.service';
import { ClaimDto } from './dto/claim.dto';
import { EnrollDto } from './dto/enroll.dto';
import { HeartbeatDto } from './dto/heartbeat.dto';
import { SubmitResultDto } from './dto/submit-result.dto';

@Controller('agents')
export class AgentsController {
  constructor(private readonly svc: AgentsService) {}

  @Post('enroll')
  @HttpCode(200)
  async enroll(@Body() dto: EnrollDto, @Ip() ip: string): Promise<{ agentId: string }> {
    try {
      return await this.svc.enroll(dto, ip);
    } catch (err) {
      if (err instanceof NotFoundError)
        throw new HttpException({ code: err.code, message: err.message }, 401);
      if (err instanceof ConflictError)
        throw new HttpException({ code: err.code, message: err.message }, 409);
      if (err instanceof ValidationError)
        throw new HttpException({ code: err.code, message: err.message }, 400);
      throw err;
    }
  }

  @Post('heartbeat')
  @HttpCode(204)
  async heartbeat(@Body() dto: HeartbeatDto, @Ip() ip: string): Promise<void> {
    try {
      await this.svc.heartbeat(dto, ip);
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      if (err instanceof NotFoundError)
        throw new HttpException({ code: err.code, message: err.message }, 404);
      throw err;
    }
  }

  @Post('jobs/claim')
  @HttpCode(200)
  async claimJob(@Body() dto: ClaimDto): Promise<{ job: unknown | null }> {
    try {
      const job = await this.svc.claimJob(dto);
      return { job };
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      throw err;
    }
  }

  @Post('jobs/:id/result')
  @HttpCode(204)
  async submitResult(@Param('id') jobId: string, @Body() dto: SubmitResultDto): Promise<void> {
    try {
      await this.svc.submitResult({ jobId, ...dto });
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      if (err instanceof NotFoundError)
        throw new HttpException({ code: err.code, message: err.message }, 404);
      throw err;
    }
  }
}
