import { BadRequestException, Injectable, NotFoundException, Inject } from '@nestjs/common';
import { and, count, desc, eq, gte, lte } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { DRIZZLE_DATABASE } from '../../database/database.constants';
import { pokerClubs, pokerClubMembers, pokerTournaments, pokerComplianceRequests, pokerRooms, pokerGames, pokerGamePlayers, pokerUsers } from '../../database/schema';

@Injectable()
export class AdminOperationsService {
  constructor(@Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase) {}

  async listClubs() {
    const rows = await this.db.select({
      id: pokerClubs.id, name: pokerClubs.name, description: pokerClubs.description,
      ownerId: pokerClubs.ownerId, status: pokerClubs.status, scheduleType: pokerClubs.scheduleType,
      dailyStartTime: pokerClubs.dailyStartTime, startsAt: pokerClubs.startsAt,
      smallBlind: pokerClubs.smallBlind, bigBlind: pokerClubs.bigBlind,
      minBuyin: pokerClubs.minBuyin, maxBuyin: pokerClubs.maxBuyin,
      maxPlayers: pokerClubs.maxPlayers, autoStart: pokerClubs.autoStart,
      sessionStatus: pokerClubs.sessionStatus, sessionStartedAt: pokerClubs.sessionStartedAt, sessionEndedAt: pokerClubs.sessionEndedAt,
      createdAt: pokerClubs.createdAt,
      memberCount: count(pokerClubMembers.id),
    }).from(pokerClubs).leftJoin(pokerClubMembers, eq(pokerClubMembers.clubId, pokerClubs.id))
      .groupBy(pokerClubs.id).orderBy(desc(pokerClubs.createdAt));
    return rows;
  }

  async createClub(body: { name: string; description?: string; ownerId?: string; scheduleType?: string; dailyStartTime?: string; startsAt?: string; smallBlind?: number; bigBlind?: number; minBuyin?: number; maxBuyin?: number; maxPlayers?: number; autoStart?: boolean }) {
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
    const rules = this.validateClubRules(body);
    const [club] = await this.db.insert(pokerClubs).values({
      name, description: body.description?.trim() || null, ownerId: body.ownerId || null,
      scheduleType, dailyStartTime: scheduleType === 'daily' ? body.dailyStartTime! : null,
      startsAt: scheduleType === 'once' && body.startsAt ? new Date(body.startsAt) : null,
      ...rules,
    }).returning();
    if (club.ownerId) await this.db.insert(pokerClubMembers).values({
      clubId: club.id, userId: club.ownerId, role: 'owner',
    }).onConflictDoNothing();
    return club;
  }

  async updateClub(id: string, body: { name?: string; description?: string; status?: string; scheduleType?: string; dailyStartTime?: string; startsAt?: string; smallBlind?: number; bigBlind?: number; minBuyin?: number; maxBuyin?: number; maxPlayers?: number; autoStart?: boolean }) {
    if (body.status && !['active', 'disabled'].includes(body.status)) throw new BadRequestException('俱乐部状态无效');
    if (body.scheduleType !== undefined) this.validateClubSchedule(body.scheduleType, body.dailyStartTime, body.startsAt);
    const rules = this.validateClubRules(body, true);
    const [row] = await this.db.update(pokerClubs).set({
      ...(body.name !== undefined ? { name: body.name.trim() } : {}),
      ...(body.description !== undefined ? { description: body.description.trim() || null } : {}),
      ...(body.status !== undefined ? { status: body.status } : {}),
      ...(body.scheduleType !== undefined ? { scheduleType: body.scheduleType,
        dailyStartTime: body.scheduleType === 'daily' ? body.dailyStartTime ?? null : null,
        startsAt: body.scheduleType === 'once' && body.startsAt ? new Date(body.startsAt) : null,
        sessionStatus: 'scheduled', sessionStartedAt: null, sessionEndedAt: null } : {}),
      ...rules,
      updatedAt: new Date(),
    }).where(eq(pokerClubs.id, id)).returning();
    if (!row) throw new NotFoundException('俱乐部不存在');
    return row;
  }

  async endClub(id: string) {
    const clubs = await this.db.select().from(pokerClubs).where(eq(pokerClubs.id, id)).limit(1);
    if (!clubs.length) throw new NotFoundException('俱乐部不存在');
    const club = clubs[0];
    if (club.sessionStatus === 'finished') return { status: 'finished', message: '本次俱乐部活动已经结束' };

    const rooms = await this.db.select({ id: pokerRooms.id, status: pokerRooms.status })
      .from(pokerRooms).where(and(eq(pokerRooms.clubId, id), eq(pokerRooms.status, 'playing'))).limit(1);
    if (rooms.length) {
      await this.db.update(pokerClubs).set({ sessionStatus: 'ending', updatedAt: new Date() }).where(eq(pokerClubs.id, id));
      return { status: 'ending', message: '当前牌局结束并结算后，俱乐部活动将自动结束' };
    }

    await this.db.transaction(async (tx) => {
      await tx.update(pokerClubs).set({
        sessionStatus: 'finished', sessionEndedAt: new Date(), updatedAt: new Date(),
      }).where(eq(pokerClubs.id, id));
      await tx.update(pokerRooms).set({ status: 'finished', updatedAt: new Date() })
        .where(and(eq(pokerRooms.clubId, id), eq(pokerRooms.status, 'waiting')));
    });
    return { status: 'finished', message: '俱乐部活动已结束' };
  }

  async getClubSessionResults(id: string) {
    const clubs = await this.db.select({
      id: pokerClubs.id, name: pokerClubs.name, sessionStatus: pokerClubs.sessionStatus,
      sessionStartedAt: pokerClubs.sessionStartedAt, sessionEndedAt: pokerClubs.sessionEndedAt,
    }).from(pokerClubs).where(eq(pokerClubs.id, id)).limit(1);
    if (!clubs.length) throw new NotFoundException('俱乐部不存在');
    const club = clubs[0];
    const members = await this.db.select({
      userId: pokerClubMembers.userId, nickname: pokerUsers.nickname,
    }).from(pokerClubMembers).innerJoin(pokerUsers, eq(pokerUsers.id, pokerClubMembers.userId))
      .where(eq(pokerClubMembers.clubId, id));
    if (!club.sessionStartedAt) {
      return { clubId: id, clubName: club.name, sessionStatus: club.sessionStatus, results: members.map(m => ({
        userId: m.userId, nickname: m.nickname, games: 0, wins: 0, totalProfit: 0, waterUp: 0, waterDown: 0,
      })) };
    }
    const conditions = [
      eq(pokerRooms.clubId, id),
      gte(pokerGames.startTime, club.sessionStartedAt),
      club.sessionEndedAt ? lte(pokerGames.endTime, club.sessionEndedAt) : sql`${pokerGames.endTime} IS NOT NULL`,
    ];
    const rows = await this.db.select({
      userId: pokerGamePlayers.userId,
      games: count(pokerGamePlayers.id),
      wins: sql<number>`coalesce(sum(case when ${pokerGamePlayers.isWinner} then 1 else 0 end), 0)`,
      totalProfit: sql<number>`coalesce(sum(${pokerGamePlayers.profit}), 0)`,
      waterUp: sql<number>`coalesce(sum(case when ${pokerGamePlayers.profit} > 0 then ${pokerGamePlayers.profit} else 0 end), 0)`,
      waterDown: sql<number>`coalesce(sum(case when ${pokerGamePlayers.profit} < 0 then -${pokerGamePlayers.profit} else 0 end), 0)`,
    }).from(pokerGamePlayers).innerJoin(pokerGames, eq(pokerGames.id, pokerGamePlayers.gameId))
      .innerJoin(pokerRooms, eq(pokerRooms.id, pokerGames.roomId))
      .where(and(...conditions)).groupBy(pokerGamePlayers.userId);
    const byUser = new Map(rows.map(row => [row.userId, row]));
    return {
      clubId: id, clubName: club.name, sessionStatus: club.sessionStatus,
      sessionStartedAt: club.sessionStartedAt, sessionEndedAt: club.sessionEndedAt,
      results: members.map(member => {
        const row = byUser.get(member.userId);
        return {
          userId: member.userId, nickname: member.nickname,
          games: Number(row?.games ?? 0), wins: Number(row?.wins ?? 0),
          totalProfit: Number(row?.totalProfit ?? 0),
          waterUp: Math.max(Number(row?.totalProfit ?? 0), 0),
          waterDown: Math.max(-Number(row?.totalProfit ?? 0), 0),
        };
      }).sort((a, b) => b.totalProfit - a.totalProfit),
    };
  }

  async listPublicClubs() {
    return this.db.select({
      id: pokerClubs.id, name: pokerClubs.name, description: pokerClubs.description,
      scheduleType: pokerClubs.scheduleType, dailyStartTime: pokerClubs.dailyStartTime,
      startsAt: pokerClubs.startsAt, smallBlind: pokerClubs.smallBlind,
      bigBlind: pokerClubs.bigBlind, minBuyin: pokerClubs.minBuyin,
      maxBuyin: pokerClubs.maxBuyin, maxPlayers: pokerClubs.maxPlayers,
      autoStart: pokerClubs.autoStart, sessionStatus: pokerClubs.sessionStatus,
      sessionStartedAt: pokerClubs.sessionStartedAt, sessionEndedAt: pokerClubs.sessionEndedAt,
      memberCount: count(pokerClubMembers.id),
    }).from(pokerClubs).leftJoin(pokerClubMembers, eq(pokerClubMembers.clubId, pokerClubs.id))
      .where(eq(pokerClubs.status, 'active')).groupBy(pokerClubs.id).orderBy(desc(pokerClubs.createdAt));
  }

  private validateClubRules(body: { smallBlind?: number; bigBlind?: number; minBuyin?: number; maxBuyin?: number; maxPlayers?: number; autoStart?: boolean }, partial = false) {
    const rules = {
      smallBlind: body.smallBlind ?? (partial ? undefined : 10),
      bigBlind: body.bigBlind ?? (partial ? undefined : 20),
      minBuyin: body.minBuyin ?? (partial ? undefined : 200),
      maxBuyin: body.maxBuyin ?? (partial ? undefined : 1000),
      maxPlayers: body.maxPlayers ?? (partial ? undefined : 9),
      autoStart: body.autoStart ?? (partial ? undefined : true),
    };
    const current = { smallBlind: rules.smallBlind ?? 10, bigBlind: rules.bigBlind ?? 20,
      minBuyin: rules.minBuyin ?? 200, maxBuyin: rules.maxBuyin ?? 1000,
      maxPlayers: rules.maxPlayers ?? 9 };
    if (current.smallBlind <= 0 || current.bigBlind !== current.smallBlind * 2 ||
        current.minBuyin < current.bigBlind * 10 || current.maxBuyin < current.minBuyin ||
        !Number.isInteger(current.maxPlayers) || current.maxPlayers < 2 || current.maxPlayers > 9) {
      throw new BadRequestException('牌桌规则无效：大盲注必须是小盲注的2倍，最低买入至少为大盲注10倍，人数为2至9人');
    }
    return Object.fromEntries(Object.entries(rules).filter(([, value]) => value !== undefined));
  }

  private validateClubSchedule(scheduleType: string, dailyStartTime?: string, startsAt?: string) {
    if (!['none', 'daily', 'once'].includes(scheduleType)) throw new BadRequestException('开赛方式无效');
    if (scheduleType === 'daily' && (!dailyStartTime || !/^([01]\d|2[0-3]):[0-5]\d$/.test(dailyStartTime))) {
      throw new BadRequestException('请设置有效的每日开赛时间');
    }
    if (scheduleType === 'once' && (!startsAt || Number.isNaN(new Date(startsAt).getTime()))) {
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
