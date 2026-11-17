import { Controller, Get, Query } from '@nestjs/common';

import type { RankUser } from '@shared/api.interface';
import { GamesService } from './games.service';

@Controller('api/rank')
export class RankController {
  constructor(private readonly gamesService: GamesService) {}

  @Get('coins')
  async getCoinRank(
    @Query('limit') limit?: string,
  ): Promise<{ items: RankUser[] }> {
    const limitNum = Math.min(Number(limit) || 20, 50);
    const items = await this.gamesService.getCoinRank(limitNum);
    return { items };
  }

  @Get('wins')
  async getWinRank(
    @Query('limit') limit?: string,
  ): Promise<{ items: RankUser[] }> {
    const limitNum = Math.min(Number(limit) || 20, 50);
    const items = await this.gamesService.getWinRank(limitNum);
    return { items };
  }
}
