import { Module } from '@nestjs/common';

import { GamesController } from './games.controller';
import { RankController } from './rank.controller';
import { GamesService } from './games.service';
import { GameAuthGuard } from './auth.guard';

@Module({
  controllers: [GamesController, RankController],
  providers: [GamesService, GameAuthGuard],
  exports: [GamesService],
})
export class GamesModule {}
