import {
  Controller,
  Get,
  Param,
  Post,
  Sse,
  Body,
  Query,
  Req,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import type { Request } from 'express';

import type { GameInfo, GameRecord } from '@shared/api.interface';
import { GamesService } from './games.service';
import { GameAuthGuard } from './auth.guard';
import { PlayerActionDto, MyRecordsQueryDto, ShowFoldedCardsDto } from './dto/action.dto';

@Controller('api/games')
@UseGuards(GameAuthGuard)
export class GamesController {
  constructor(private readonly gamesService: GamesService) {}

  @Get('my-records')
  async getMyRecords(
    @Req() req: Request,
    @Query() query: MyRecordsQueryDto,
  ): Promise<{ items: GameRecord[]; total: number; page: number; pageSize: number }> {
    const userId = (req as unknown as { user: string }).user;
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    return this.gamesService.getMyRecords(userId, page, pageSize);
  }

  @Sse('rooms/:roomId/events')
  async streamRoomEvents(
    @Param('roomId', ParseUUIDPipe) roomId: string,
    @Req() req: Request,
  ) {
    const userId = (req as unknown as { user: string }).user;
    return this.gamesService.streamRoomEvents(roomId, userId);
  }

  @Get(':id')
  async getGame(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ): Promise<GameInfo> {
    const userId = (req as unknown as { user: string }).user;
    return this.gamesService.getGame(id, userId);
  }


  @Post(':id/show-folded-cards')
  async setFoldedCardsVisibility(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
    @Body() dto: ShowFoldedCardsDto,
  ): Promise<GameInfo> {
    const userId = (req as unknown as { user: string }).user;
    return this.gamesService.setFoldedCardsVisibility(id, userId, dto.show);
  }

  @Post('action')
  async playerAction(
    @Req() req: Request,
    @Body() dto: PlayerActionDto,
  ): Promise<GameInfo> {
    const userId = (req as unknown as { user: string }).user;
    return this.gamesService.playerAction(
      dto.gameId,
      userId,
      dto.action,
      dto.amount,
    );
  }
}
