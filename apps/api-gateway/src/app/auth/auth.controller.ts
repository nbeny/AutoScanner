import { Body, Controller, HttpCode, HttpException, Ip, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { InvalidCredentialsError } from '@autoscanner/common';
import { AuthService } from './auth.service';
import { AuthPayload, LoginDto } from './dto/login.dto';

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
}
