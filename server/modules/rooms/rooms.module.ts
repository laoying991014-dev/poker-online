import { Module } from '@nestjs/common';
import { GamesModule } from '../games/games.module';

import { RoomsController } from './rooms.controller';
import { RoomsService } from './rooms.service';
import { RoomAuthGuard } from './auth.guard';

@Module({
  imports: [GamesModule],
  controllers: [RoomsController],
  providers: [RoomsService, RoomAuthGuard],
  exports: [RoomsService],
})
export class RoomsModule {}
