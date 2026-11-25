import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, count, desc, eq, ilike, or, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { DRIZZLE_DATABASE } from '../../database/database.constants';

import type {
  GameInfo,
  RechargeRecord,
  RoomInfo,
  UserInfo,
  UserListResponse,
} from '@shared/api.interface';
import {
  pokerGames,
  pokerRechargeRecords,
  pokerRooms,
  pokerUsers,
} from '../../database/schema';
import {
  GameListQueryDto,
  RechargeDto,
  RechargeRecordListQueryDto,
  UserListQueryDto,
} from './dto/recharge.dto';

function mapToUserInfo(row: {
  id: string;
  username: string;
  nickname: string;
  avatarUrl: string | null;
  coins: number;
  isAdmin: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
}): UserInfo {
  return {
    id: row.id,
    username: row.username,
    nickname: row.nickname,
    avatarUrl: row.avatarUrl,
    coins: row.coins,
    isAdmin: row.isAdmin,
    lastLoginAt: row.lastLoginAt ? row.lastLoginAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

function mapToRechargeRecord(row: {
  id: string;
  adminId: string;
  userId: string;
  amount: number;
  remark: string | null;
  createdAt: Date;
}): RechargeRecord {
  return {
    id: row.id,
    adminId: row.adminId,
    userId: row.userId,
    amount: row.amount,
    remark: row.remark,
    createdAt: row.createdAt.toISOString(),
  };
}

function mapToRoomInfo(row: {
  id: string;
  roomCode: string;
  name: string;
  hostId: string;
  smallBlind: number;
  bigBlind: number;
  minBuyin: number;
  maxBuyin: number;
  maxPlayers: number;
  status: string;
  isPrivate: boolean;
  currentGameId: string | null;
  players: unknown;
  matchQueue: boolean;
  createdAt: Date;
}): RoomInfo {
  return {
    id: row.id,
    roomCode: row.roomCode,
    name: row.name,
    hostId: row.hostId,
    smallBlind: row.smallBlind,
    bigBlind: row.bigBlind,
    minBuyin: row.minBuyin,
    maxBuyin: row.maxBuyin,
    maxPlayers: row.maxPlayers,
    status: row.status as RoomInfo['status'],
    isPrivate: row.isPrivate,
    currentGameId: row.currentGameId,
    players: (row.players ?? []) as RoomInfo['players'],
    matchQueue: row.matchQueue,
    createdAt: row.createdAt.toISOString(),
  };
}

function mapToGameInfo(row: {
  id: string;
  roomId: string;
  players: unknown;
  communityCards: unknown;
  pot: number;
  rakeAmount: number;
  sidePots: unknown;
  winnerIds: string[];
  status: string;
  currentBet: number;
  currentPlayerSeat: number | null;
  dealerSeat: number;
  smallBlindSeat: number | null;
  bigBlindSeat: number | null;
  round: string;
  startTime: Date;
  endTime: Date | null;
  updatedAt: Date;
}): GameInfo {
  return {
    id: row.id,
    roomId: row.roomId,
    players: (row.players ?? []) as GameInfo['players'],
    communityCards: (row.communityCards ?? []) as string[],
    pot: row.pot,
    rakeAmount: Number(row.rakeAmount ?? 0),
    sidePots: (row.sidePots ?? []) as GameInfo['sidePots'],
    winnerIds: row.winnerIds ?? [],
    status: row.status as GameInfo['status'],
    currentBet: row.currentBet,
    currentPlayerSeat: row.currentPlayerSeat,
    dealerSeat: row.dealerSeat,
    smallBlindSeat: row.smallBlindSeat,
    bigBlindSeat: row.bigBlindSeat,
    round: row.round as GameInfo['round'],
    turnStartedAt: row.updatedAt.toISOString(),
    turnTimeoutSeconds: 30,
    serverNow: new Date().toISOString(),
    startTime: row.startTime.toISOString(),
    endTime: row.endTime ? row.endTime.toISOString() : null,
  };
}

@Injectable()
export class AdminService {
  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
  ) {}

  async getUserList(query: UserListQueryDto): Promise<UserListResponse> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const offset = (page - 1) * pageSize;

    const whereConditions = [];
    if (query.keyword && query.keyword.trim()) {
      const keyword = `%${query.keyword.trim()}%`;
      whereConditions.push(
        or(
          ilike(pokerUsers.username, keyword),
          ilike(pokerUsers.nickname, keyword),
        ),
      );
    }

    const where =
      whereConditions.length > 0 ? and(...whereConditions) : undefined;

    const [totalResult, rows] = await Promise.all([
      this.db
        .select({ count: count() })
        .from(pokerUsers)
        .where(where),
      this.db
        .select({
          id: pokerUsers.id,
          username: pokerUsers.username,
          nickname: pokerUsers.nickname,
          avatarUrl: pokerUsers.avatarUrl,
          coins: pokerUsers.coins,
          isAdmin: pokerUsers.isAdmin,
          lastLoginAt: pokerUsers.lastLoginAt,
          createdAt: pokerUsers.createdAt,
        })
        .from(pokerUsers)
        .where(where)
        .orderBy(desc(pokerUsers.createdAt))
        .limit(pageSize)
        .offset(offset),
    ]);

    const total = Number(totalResult[0]?.count ?? 0);

    return {
      items: rows.map(mapToUserInfo),
      total,
      page,
      pageSize,
    };
  }

  async recharge(adminId: string, dto: RechargeDto): Promise<RechargeRecord> {
    if (dto.amount === 0) {
      throw new BadRequestException('充值金额不能为0');
    }

    // 验证目标用户存在
    const userExists = await this.db
      .select({ id: pokerUsers.id })
      .from(pokerUsers)
      .where(eq(pokerUsers.id, dto.userId))
      .limit(1);

    if (userExists.length === 0) {
      throw new NotFoundException('目标用户不存在');
    }

    // 使用事务：更新用户金币 + 插入充值记录
    const result = await this.db.transaction(async (tx) => {
      // 原子更新金币
      await tx
        .update(pokerUsers)
        .set({
          coins: sql<number>`${pokerUsers.coins} + ${dto.amount}`,
        })
        .where(eq(pokerUsers.id, dto.userId));

      // 写入充值记录
      const inserted = await tx
        .insert(pokerRechargeRecords)
        .values({
          adminId,
          userId: dto.userId,
          amount: dto.amount,
          remark: dto.remark ?? null,
        })
        .returning({
          id: pokerRechargeRecords.id,
          adminId: pokerRechargeRecords.adminId,
          userId: pokerRechargeRecords.userId,
          amount: pokerRechargeRecords.amount,
          remark: pokerRechargeRecords.remark,
          createdAt: pokerRechargeRecords.createdAt,
        });

      return inserted[0];
    });

    return mapToRechargeRecord(result);
  }

  async getRechargeRecords(
    query: RechargeRecordListQueryDto,
  ): Promise<{
    items: RechargeRecord[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const offset = (page - 1) * pageSize;

    const [totalResult, rows] = await Promise.all([
      this.db
        .select({ count: count() })
        .from(pokerRechargeRecords),
      this.db
        .select({
          id: pokerRechargeRecords.id,
          adminId: pokerRechargeRecords.adminId,
          userId: pokerRechargeRecords.userId,
          amount: pokerRechargeRecords.amount,
          remark: pokerRechargeRecords.remark,
          createdAt: pokerRechargeRecords.createdAt,
        })
        .from(pokerRechargeRecords)
        .orderBy(desc(pokerRechargeRecords.createdAt))
        .limit(pageSize)
        .offset(offset),
    ]);

    const total = Number(totalResult[0]?.count ?? 0);

    return {
      items: rows.map(mapToRechargeRecord),
      total,
      page,
      pageSize,
    };
  }

  async getRoomList(): Promise<RoomInfo[]> {
    const rows = await this.db
      .select({
        id: pokerRooms.id,
        roomCode: pokerRooms.roomCode,
        name: pokerRooms.name,
        hostId: pokerRooms.hostId,
        smallBlind: pokerRooms.smallBlind,
        bigBlind: pokerRooms.bigBlind,
        minBuyin: pokerRooms.minBuyin,
        maxBuyin: pokerRooms.maxBuyin,
        maxPlayers: pokerRooms.maxPlayers,
        status: pokerRooms.status,
        isPrivate: pokerRooms.isPrivate,
        currentGameId: pokerRooms.currentGameId,
        players: pokerRooms.players,
        matchQueue: pokerRooms.matchQueue,
        createdAt: pokerRooms.createdAt,
      })
      .from(pokerRooms)
      .orderBy(desc(pokerRooms.createdAt));

    return rows.map(mapToRoomInfo);
  }

  async getGameList(
    query: GameListQueryDto,
  ): Promise<{
    items: GameInfo[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const offset = (page - 1) * pageSize;

    const whereConditions = [];
    if (query.roomId) {
      whereConditions.push(eq(pokerGames.roomId, query.roomId));
    }

    const where =
      whereConditions.length > 0 ? and(...whereConditions) : undefined;

    const [totalResult, rows] = await Promise.all([
      this.db
        .select({ count: count() })
        .from(pokerGames)
        .where(where),
      this.db
        .select({
          id: pokerGames.id,
          roomId: pokerGames.roomId,
          players: pokerGames.players,
          communityCards: pokerGames.communityCards,
          pot: pokerGames.pot,
          sidePots: pokerGames.sidePots,
          winnerIds: pokerGames.winnerIds,
          status: pokerGames.status,
          currentBet: pokerGames.currentBet,
          currentPlayerSeat: pokerGames.currentPlayerSeat,
          dealerSeat: pokerGames.dealerSeat,
          smallBlindSeat: pokerGames.smallBlindSeat,
          bigBlindSeat: pokerGames.bigBlindSeat,
          round: pokerGames.round,
          startTime: pokerGames.startTime,
          endTime: pokerGames.endTime,
          updatedAt: pokerGames.updatedAt,
        })
        .from(pokerGames)
        .where(where)
        .orderBy(desc(pokerGames.createdAt))
        .limit(pageSize)
        .offset(offset),
    ]);

    const total = Number(totalResult[0]?.count ?? 0);

    return {
      items: rows.map(mapToGameInfo),
      total,
      page,
      pageSize,
    };
  }
}
