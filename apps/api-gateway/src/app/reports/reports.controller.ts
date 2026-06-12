import { Controller, Get, HttpException, Param, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import type { User } from '@prisma/client';

import { ConflictError, NotFoundError } from '@autoscanner/common';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ReportsService } from './reports.service';

@Controller('reports')
@UseGuards(JwtAuthGuard)
export class ReportsController {
  constructor(private readonly svc: ReportsService) {}

  @Get(':id/download')
  async download(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    let payload;
    try {
      payload = await this.svc.streamDownload(user.id, id);
    } catch (err) {
      if (err instanceof NotFoundError) {
        throw new HttpException({ code: err.code, message: err.message }, 404);
      }
      if (err instanceof ConflictError) {
        throw new HttpException({ code: err.code, message: err.message }, 409);
      }
      throw err;
    }

    const { stream, contentType, sizeBytes, filename } = payload;
    res.setHeader('Content-Type', contentType);
    if (sizeBytes > 0) res.setHeader('Content-Length', String(sizeBytes));
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    await new Promise<void>((resolve, reject) => {
      stream.on('error', reject);
      res.on('finish', resolve);
      res.on('close', resolve);
      stream.pipe(res);
    });
  }
}
