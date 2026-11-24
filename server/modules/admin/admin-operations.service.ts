import { BadRequestException, Injectable, NotFoundException, Inject } from '@nestjs/common';
import { count, desc, eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { DRIZZLE_DATABASE } from '../../database/database.constants';
import { pokerClubs, pokerClubMembers, pokerTournaments, pokerComplianceRequests } from '../../database/schema';

@Injectable()
export class AdminOperationsService {
  constructor(@Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase) {}

  async listClubs() {
    const rows = await this.db.select({
      id: pokerClubs.id, name: pokerClubs.name, description: pokerClubs.description,
      ownerId: pokerClubs.ownerId, status: pokerClubs.status, scheduleType: pokerClubs.scheduleType,
      dailyStartTime: pokerClubs.dailyStartTime, startsAt: pokerClubs.startsAt, createdAt: pokerClubs.createdAt,
      memberCount: count(pokerClubMembers.id),
    }).from(pokerClubs).leftJoin(pokerClubMembers, eq(pokerClubMembers.clubId, pokerClubs.id))
      .groupBy(pokerClubs.id).orderBy(desc(pokerClubs.createdAt));
    return rows;
  }

  async createClub(body: { name: string; description?: string; ownerId?: string; scheduleType?: string; dailyStartTime?: string; startsAt?: string }) {
    const name = body.name?.trim();
    if (!name) throw new BadRequestException('俱乐部名称不能为空');
    if (body.ownerId) {
      const owner = await this.db.select({ id: pokerClubMembers.userId }).from(pokerClubMembers)
        .where(eq(pokerClubMembers.userId, body.ownerId)).limit(1);
      // Owner membership is optional; the user id is still validated by the FK on insert.
      void owner;
    }
    const scheduleType = body.scheduleType ?? 'none';
    this.validateClubSchedule(scheduleType, body.dailyStartTime, body.startsAt);
    const [club] = await this.db.insert(pokerClubs).values({
      name, description: body.description?.trim() || null, ownerId: body.ownerId || null,
      scheduleType, dailyStartTime: scheduleType === 'daily' ? body.dailyStartTime! : null,
      startsAt: scheduleType === 'once' && body.startsAt ? new Date(body.startsAt) : null,
    }).returning();
    if (club.ownerId) await this.db.insert(pokerClubMembers).values({
      clubId: club.id, userId: club.ownerId, role: 'owner',
    }).onConflictDoNothing();
    return club;
  }

  async updateClub(id: string, body: { name?: string; description?: string; status?: string; scheduleType?: string; dailyStartTime?: string; startsAt?: string }) {
    if (body.status && !['active', 'disabled'].includes(body.status)) throw new BadRequestException('俱乐部状态无效');
    if (body.scheduleType !== undefined) this.validateClubSchedule(body.scheduleType, body.dailyStartTime, body.startsAt);
    const [row] = await this.db.update(pokerClubs).set({
      ...(body.name !== undefined ? { name: body.name.trim() } : {}),
      ...(body.description !== undefined ? { description: body.description.trim() || null } : {}),
      ...(body.status !== undefined ? { status: body.status } : {}),
      ...(body.scheduleType !== undefined ? { scheduleType: body.scheduleType,
        dailyStartTime: body.scheduleType === 'daily' ? body.dailyStartTime ?? null : null,
        startsAt: body.scheduleType === 'once' && body.startsAt ? new Date(body.startsAt) : null } : {}),
      updatedAt: new Date(),
    }).where(eq(pokerClubs.id, id)).returning();
    if (!row) throw new NotFoundException('俱乐部不存在');
    return row;
  }

  async listPublicClubs() {
    return this.db.select({
      id: pokerClubs.id, name: pokerClubs.name, description: pokerClubs.description,
      scheduleType: pokerClubs.scheduleType, dailyStartTime: pokerClubs.dailyStartTime,
      startsAt: pokerClubs.startsAt, memberCount: count(pokerClubMembers.id),
    }).from(pokerClubs).leftJoin(pokerClubMembers, eq(pokerClubMembers.clubId, pokerClubs.id))
      .where(eq(pokerClubs.status, 'active')).groupBy(pokerClubs.id).orderBy(desc(pokerClubs.createdAt));
  }

  private validateClubSchedule(scheduleType: string, dailyStartTime?: string, startsAt?: string) {
    if (!['none', 'daily', 'once'].includes(scheduleType)) throw new BadRequestException('开赛方式无效');
    if (scheduleType === 'daily' && (!dailyStartTime || !/^([01]\\d|2[0-3]):[0-5]\\d$/.test(dailyStartTime))) {
      throw new BadRequestException('请设置有效的每日开赛时间');
    }
    if (scheduleType === 'once' && startsAt && Number.isNaN(new Date(startsAt).getTime())) {
      throw new BadRequestException('指定开赛日期无效');
    }
  }

  async listTournaments() {
    return this.db.select().from(pokerTournaments).orderBy(desc(pokerTournaments.createdAt));
  }

  async createTournament(body: { name: string; description?: string; entryFee?: number; prizePool?: number; maxPlayers?: number; startsAt?: string; status?: string }) {
    const name = body.name?.trim();
    if (!name) throw new BadRequestException('赛事名称不能为空');
    const entryFee = body.entryFee ?? 0;
    const prizePool = body.prizePool ?? 0;
    const maxPlayers = body.maxPlayers ?? 100;
    if (!Number.isSafeInteger(entryFee) || entryFee < 0 || !Number.isSafeInteger(prizePool) || prizePool < 0) throw new BadRequestException('虚拟金币数值无效');
    if (!Number.isInteger(maxPlayers) || maxPlayers < 2 || maxPlayers > 10000) throw new BadRequestException('参赛人数必须在 2 到 10000 之间');
    const status = body.status ?? 'draft';
    if (!['draft', 'scheduled', 'running', 'finished', 'cancelled'].includes(status)) throw new BadRequestException('赛事状态无效');
    const [row] = await this.db.insert(pokerTournaments).values({
      name, description: body.description?.trim() || null, entryFee, prizePool, maxPlayers,
      startsAt: body.startsAt ? new Date(body.startsAt) : null, status, currencyType: 'virtual_coins',
    }).returning();
    return row;
  }

  async updateTournament(id: string, body: { status?: string; name?: string; description?: string; startsAt?: string }) {
    if (body.status && !['draft', 'scheduled', 'running', 'finished', 'cancelled'].includes(body.status)) throw new BadRequestException('赛事状态无效');
    const [row] = await this.db.update(pokerTournaments).set({
      ...(body.status !== undefined ? { status: body.status } : {}),
      ...(body.name !== undefined ? { name: body.name.trim() } : {}),
      ...(body.description !== undefined ? { description: body.description.trim() || null } : {}),
      ...(body.startsAt !== undefined ? { startsAt: body.startsAt ? new Date(body.startsAt) : null } : {}),
      updatedAt: new Date(),
      currencyType: 'virtual_coins',
    }).where(eq(pokerTournaments.id, id)).returning();
    if (!row) throw new NotFoundException('赛事不存在');
    return row;
  }

  async listRequests() {
    return this.db.select().from(pokerComplianceRequests).orderBy(desc(pokerComplianceRequests.createdAt));
  }

  async updateRequest(id: string, body: { status: string; adminNote?: string }, adminId: string) {
    if (!['approved', 'rejected', 'closed', 'pending'].includes(body.status)) throw new BadRequestException('申请状态无效');
    const [row] = await this.db.update(pokerComplianceRequests).set({
      status: body.status, adminNote: body.adminNote?.trim() || null,
      reviewedBy: adminId, reviewedAt: new Date(), updatedAt: new Date(),
    }).where(eq(pokerComplianceRequests.id, id)).returning();
    if (!row) throw new NotFoundException('申请记录不存在');
    return row;
  }
}
