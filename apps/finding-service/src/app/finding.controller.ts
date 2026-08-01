import { Controller, Get, HttpCode } from '@nestjs/common';

@Controller()
export class FindingController {
  @Get('health')
  @HttpCode(200)
  health(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
