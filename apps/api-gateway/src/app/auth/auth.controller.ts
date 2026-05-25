import {
  Body,
  Controller,
  HttpCode,
  HttpException,
  Ip,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { InvalidCredentialsError } from '@autoscanner/common';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { AuthPayload, LoginDto, RefreshDto } from './dto/login.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: LoginDto, @Req() req: Request, @Ip() ip: string): Promise<AuthPayload> {
    try {
      return await this.auth.login(dto.email, dto.password, {
        userAgent: req.headers['user-agent'] as string | undefined,
        ip,
      });
    } catch (err) {
      if (err instanceof InvalidCredentialsError) {
        throw new HttpException({ code: err.code, message: err.message }, 401);
      }
      throw err;
    }
  }

  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Body() dto: RefreshDto,
    @Req() req: Request,
    @Ip() ip: string,
  ): Promise<AuthPayload> {
    try {
      return await this.auth.refresh(dto.refreshToken, {
        userAgent: req.headers['user-agent'] as string | undefined,
        ip,
      });
    } catch (err) {
      if (err instanceof InvalidCredentialsError) {
        throw new HttpException({ code: err.code, message: err.message }, 401);
      }
      throw err;
    }
  }

  @Post('logout')
  @HttpCode(204)
  @UseGuards(JwtAuthGuard)
  async logout(@Req() req: Request): Promise<void> {
    const sessionId = (req as Request & { sessionId?: string }).sessionId;
    if (!sessionId) {
      throw new HttpException('missing session context', 401);
    }
    await this.auth.logout(sessionId);
  }
}
