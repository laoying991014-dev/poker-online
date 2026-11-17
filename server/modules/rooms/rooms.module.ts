import { Module } from '@nestjs/common';

import { RoomsController } from './rooms.controller';
import { RoomsService } from './rooms.service';
import { RoomAuthGuard } from './auth.guard';

@Module({
  controllers: [RoomsController],
  providers: [RoomsService, RoomAuthGuard],
  exports: [RoomsService],
})
export class RoomsModule {}
