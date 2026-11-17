import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';

import { AdminService } from './admin.service';
import { AdminAuthGuard, getUserIdFromRequest } from './auth.guard';
import { AdminGuard } from './admin.guard';
import {
  GameListQueryDto,
  RechargeDto,
  RechargeRecordListQueryDto,
  UserListQueryDto,
} from './dto/recharge.dto';

@Controller('api/admin')
@UseGuards(AdminAuthGuard, AdminGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('users')
  async getUserList(@Query() query: UserListQueryDto) {
    return this.adminService.getUserList(query);
  }

  @Post('recharge')
  async recharge(@Req() req: Request, @Body() dto: RechargeDto) {
    const adminId = getUserIdFromRequest(req);
    return this.adminService.recharge(adminId, dto);
  }

  @Get('recharge-records')
  async getRechargeRecords(@Query() query: RechargeRecordListQueryDto) {
    return this.adminService.getRechargeRecords(query);
  }

  @Get('rooms')
  async getRoomList() {
    return this.adminService.getRoomList();
  }

  @Get('games')
  async getGameList(@Query() query: GameListQueryDto) {
    return this.adminService.getGameList(query);
  }
}
