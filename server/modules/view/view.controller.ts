import { Controller, Get, NotFoundException, Req, Res } from '@nestjs/common';
import { existsSync } from 'fs';
import { join } from 'path';
import type { Request, Response } from 'express';

@Controller()
export class ViewController {
  @Get(['/', '*'])
  render(@Req() req: Request, @Res() res: Response): void {
    if (req.path.startsWith('/api/')) {
      throw new NotFoundException('接口不存在');
    }

    const indexFile = join(process.cwd(), 'dist', 'client', 'index.html');
    if (!existsSync(indexFile)) {
      res.status(503).send('前端尚未构建，请先执行 npm run build:client');
      return;
    }

    res.sendFile(indexFile);
  }
}
