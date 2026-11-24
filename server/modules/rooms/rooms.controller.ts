import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';

import type {
  RoomInfo,
  MatchQueueInfo,
} from '@shared/api.interface';
import { RoomsService } from './rooms.service';
import { RoomAuthGuard } from './auth.guard';
import { CreateRoomDto } from './dto/create-room.dto';
import { JoinRoomDto } from './dto/join-room.dto';
import { JoinMatchDto } from './dto/match.dto';

@Controller('api/rooms')
export class RoomsController {
  constructor(private readonly roomsService: RoomsService) {}

  @Get()
  async listRooms(): Promise<RoomInfo[]> {
    return this.roomsService.listPublicRooms();
  }

  @Get('mine')
  @UseGuards(RoomAuthGuard)
  async listMyRooms(@Req() req: Request): Promise<RoomInfo[]> {
    const userId = (req as unknown as { user: string }).user;
    return this.roomsService.listMyRooms(userId);
  }

  @Get('match/status')
  @UseGuards(RoomAuthGuard)
  getMatchStatus(@Req() req: Request): {
    waiting: boolean;
    waitingCount: number;
    roomId: string | null;
  } {
    const userId = (req as unknown as { user: string }).user;
    return this.roomsService.getMatchStatus(userId);
  }

  @Get(':id')
  @UseGuards(RoomAuthGuard)
  async getRoom(
    @Param('id') id: string,
    @Req() req: Request,
  ): Promise<RoomInfo> {
    const userId = (req as unknown as { user: string }).user;
    return this.roomsService.getRoom(id, userId);
  }

  @Post()
  @UseGuards(RoomAuthGuard)
  async createRoom(
    @Body() dto: CreateRoomDto,
    @Req() req: Request,
  ): Promise<RoomInfo> {
    const userId = (req as unknown as { user: string }).user;
    return this.roomsService.createRoom(dto, userId);
  }

  @Post('join')
  @UseGuards(RoomAuthGuard)
  async joinRoom(
    @Body() dto: JoinRoomDto,
    @Req() req: Request,
  ): Promise<RoomInfo> {
    const userId = (req as unknown as { user: string }).user;
    return this.roomsService.joinRoom(dto, userId);
  }


  @Post('clubs/:clubId/join')
  @UseGuards(RoomAuthGuard)
  async joinClub(
    @Param('clubId') clubId: string,
    @Body('timezoneOffsetMinutes') timezoneOffsetMinutes: number,
    @Req() req: Request,
  ): Promise<RoomInfo> {
    const userId = (req as unknown as { user: string }).user;
    return this.roomsService.joinClub(clubId, userId, Number(timezoneOffsetMinutes) || 0);
  }

  @Post('match/join')
  @UseGuards(RoomAuthGuard)
  async joinMatch(
    @Body() dto: JoinMatchDto,
    @Req() req: Request,
  ): Promise<{ status: string }> {
    const userId = (req as unknown as { user: string }).user;
    return this.roomsService.joinMatchQueue(userId, dto.buyinAmount);
  }

  @Post('match/leave')
  @UseGuards(RoomAuthGuard)
  leaveMatch(@Req() req: Request): void {
    const userId = (req as unknown as { user: string }).user;
    this.roomsService.leaveMatchQueue(userId);
  }

  @Post(':id/leave')
  @UseGuards(RoomAuthGuard)
  async leaveRoom(
    @Param('id') id: string,
    @Req() req: Request,
  ): Promise<RoomInfo | null> {
    const userId = (req as unknown as { user: string }).user;
    return this.roomsService.leaveRoom(id, userId);
  }

  @Post(':id/start')
  @UseGuards(RoomAuthGuard)
  async startGame(
    @Param('id') id: string,
    @Req() req: Request,
  ): Promise<{ gameId: string }> {
    const userId = (req as unknown as { user: string }).user;
    return this.roomsService.startGame(id, userId);
  }
}
