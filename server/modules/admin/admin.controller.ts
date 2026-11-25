import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Req,
  UseGuards,
  Patch,
  Param,
} from '@nestjs/common';
import type { Request } from 'express';

import { AdminService } from './admin.service';
import { AdminOperationsService } from './admin-operations.service';
import { CreateClubDto, UpdateClubDto, CreateTournamentDto, UpdateTournamentDto, UpdateComplianceRequestDto } from './dto/admin-operations.dto';
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
  constructor(private readonly adminService: AdminService, private readonly operations: AdminOperationsService) {}

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

  @Get('clubs')
  listClubs() { return this.operations.listClubs(); }

  @Post('clubs')
  createClub(@Body() body: CreateClubDto) { return this.operations.createClub(body); }

  @Patch('clubs/:id')
  updateClub(@Param('id') id: string, @Body() body: UpdateClubDto) { return this.operations.updateClub(id, body); }

  @Post('clubs/:id/end')
  endClub(@Param('id') id: string) { return this.operations.endClub(id); }

  @Get('tournaments')
  listTournaments() { return this.operations.listTournaments(); }

  @Post('tournaments')
  createTournament(@Body() body: CreateTournamentDto) { return this.operations.createTournament(body); }

  @Patch('tournaments/:id')
  updateTournament(@Param('id') id: string, @Body() body: UpdateTournamentDto) { return this.operations.updateTournament(id, body); }

  @Get('compliance-requests')
  listComplianceRequests() { return this.operations.listRequests(); }

  @Patch('compliance-requests/:id')
  updateComplianceRequest(@Req() req: Request, @Param('id') id: string, @Body() body: UpdateComplianceRequestDto) {
    return this.operations.updateRequest(id, body, getUserIdFromRequest(req));
  }

}
