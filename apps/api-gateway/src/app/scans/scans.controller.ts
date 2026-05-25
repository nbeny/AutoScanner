import { Controller, Get, HttpException, Param, Redirect, UseGuards } from '@nestjs/common';
import type { User } from '@prisma/client';
import { NotFoundError } from '@autoscanner/common';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ScansService } from './scans.service';

@Controller('scan-jobs')
@UseGuards(JwtAuthGuard)
export class ScansController {
  constructor(private readonly svc: ScansService) {}

  @Get(':id/raw')
  @Redirect()
  async getRaw(
    @CurrentUser() user: User,
    @Param('id') id: string,
  ): Promise<{ url: string; statusCode: number }> {
    try {
      const { url } = await this.svc.getRawOutputPresignedUrl(user.id, id);
      return { url, statusCode: 302 };
    } catch (err) {
      if (err instanceof NotFoundError) {
        throw new HttpException({ code: err.code, message: err.message }, 404);
      }
      throw err;
    }
  }
}
