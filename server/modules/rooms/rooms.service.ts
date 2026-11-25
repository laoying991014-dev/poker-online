import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { eq, and, desc, sql, inArray } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { DRIZZLE_DATABASE } from '../../database/database.constants';
import { GameRealtimeService } from '../games/game-realtime.service';

import type {
  RoomInfo,
  RoomPlayer,
  GamePlayer,
} from '@shared/api.interface';
import { pokerRooms, pokerUsers, pokerGames, pokerGamePlayers, pokerClubs, pokerClubMembers } from '../../database/schema';
import { GamesService } from '../games/games.service';
import { createDeck, shuffleDeck } from '../../common/utils/poker';
import { CreateRoomDto } from './dto/create-room.dto';
import { JoinRoomDto } from './dto/join-room.dto';
import { BOT_USER_ID } from '../games/bot';

const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MATCH_SMALL_BLIND = 10;
const MATCH_BIG_BLIND = 20;
const MATCH_MIN_BUYIN = 200;
const MATCH_MAX_BUYIN = 1000;
const MATCH_TARGET_PLAYERS = 6;
const MATCH_MIN_PLAYERS = 2;
const MATCH_WAIT_MS = 30 * 1000; // 30 秒后允许 2 人开局

interface MatchQueueEntry {
  userId: string;
  buyinAmount: number;
  joinedAt: number;
}

interface MatchResult {
  roomId: string;
  matchedAt: number;
}

@Injectable()
export class RoomsService {
  private matchQueue = new Map<string, MatchQueueEntry>();
  private userMatchResults = new Map<string, MatchResult>();
  private matchTimer: ReturnType<typeof setTimeout> | null = null;
  private matching = false;

  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
    private readonly realtime: GameRealtimeService,
    private readonly games: GamesService,
  ) {}


  async getMyClubStats(userId: string) {
    const rows = await this.db.select({
      clubId: pokerRooms.clubId,
      clubName: pokerClubs.name,
      games: sql<number>`count(${pokerGamePlayers.id})`,
      totalProfit: sql<number>`coalesce(sum(${pokerGamePlayers.profit}), 0)`,
      waterUp: sql<number>`coalesce(sum(case when ${pokerGamePlayers.profit} > 0 then ${pokerGamePlayers.profit} else 0 end), 0)`,
      waterDown: sql<number>`coalesce(sum(case when ${pokerGamePlayers.profit} < 0 then -${pokerGamePlayers.profit} else 0 end), 0)`,
      wins: sql<number>`coalesce(sum(case when ${pokerGamePlayers.isWinner} then 1 else 0 end), 0)`,
    }).from(pokerGamePlayers)
      .innerJoin(pokerGames, eq(pokerGames.id, pokerGamePlayers.gameId))
      .innerJoin(pokerRooms, eq(pokerRooms.id, pokerGames.roomId))
      .innerJoin(pokerClubs, eq(pokerClubs.id, pokerRooms.clubId))
      .where(eq(pokerGamePlayers.userId, userId))
      .groupBy(pokerRooms.clubId, pokerClubs.name);
    return rows.map((row) => ({
      clubId: row.clubId,
      clubName: row.clubName,
      games: Number(row.games),
      wins: Number(row.wins),
      totalProfit: Number(row.totalProfit),
      waterUp: Number(row.waterUp),
      waterDown: Number(row.waterDown),
    }));
  }

  // ====== 房间列表 ======
  async listPublicRooms(): Promise<RoomInfo[]> {
    const rows = await this.db
      .select()
      .from(pokerRooms)
      .where(
        and(eq(pokerRooms.isPrivate, false), eq(pokerRooms.status, 'waiting')),
      )
      .orderBy(desc(pokerRooms.createdAt));

    return rows.map((row) => this.mapRoomInfo(row));
  }

  // ====== 当前用户所在的牌桌（用于误退出后的继续游戏） ======
  async listMyRooms(userId: string): Promise<RoomInfo[]> {
    const rows = await this.db
      .select()
      .from(pokerRooms)
      .where(inArray(pokerRooms.status, ['waiting', 'playing']))
      .orderBy(desc(pokerRooms.updatedAt));

    return rows
      .filter((row) => {
        const players = (row.players ?? []) as unknown as RoomPlayer[];
        return players.some((player) => player.userId === userId);
      })
      .map((row) => this.mapRoomInfo(row));
  }

  // ====== 房间详情 ======
  async getRoom(id: string, userId: string): Promise<RoomInfo> {
    const rows = await this.db
      .select()
      .from(pokerRooms)
      .where(eq(pokerRooms.id, id))
      .limit(1);

    if (rows.length === 0) {
      throw new NotFoundException('房间不存在');
    }

    const roomPlayers = (rows[0].players ?? []) as unknown as RoomPlayer[];
    if (!roomPlayers.some((player) => player.userId === userId)) {
      throw new ForbiddenException('你不在此房间中，无法进入这张牌桌');
    }

    const info = this.mapRoomInfo(rows[0]);
    const ids = info.players.map((p) => p.userId).filter(Boolean);
    if (ids.length > 0) {
      const users = await this.db
        .select({ id: pokerUsers.id, nickname: pokerUsers.nickname })
        .from(pokerUsers)
        .where(inArray(pokerUsers.id, ids));
      const nameMap = new Map(users.map((u) => [u.id, u.nickname]));
      info.players = info.players.map((p) => ({
        ...p,
        nickname: nameMap.get(p.userId) || p.nickname,
      }));
    }
    return info;
  }


  // ====== 加入俱乐部专属牌桌：按管理员配置自动分配座位 ======
  async joinClub(clubId: string, userId: string, timezoneOffsetMinutes = 0): Promise<RoomInfo> {
    const roomCode = await this.generateRoomCode();
    const room = await this.db.transaction(async (tx) => {
      const clubs = await tx.select().from(pokerClubs).where(eq(pokerClubs.id, clubId)).limit(1).for('update');
      if (!clubs.length || clubs[0].status !== 'active') throw new NotFoundException('俱乐部不存在或已停用');
      const club = clubs[0];
      const localNow = new Date(Date.now() - timezoneOffsetMinutes * 60000);
      if (club.scheduleType === 'daily' && club.dailyStartTime) {
        const [hour, minute] = club.dailyStartTime.split(':').map(Number);
        if (localNow.getHours() < hour || (localNow.getHours() === hour && localNow.getMinutes() < minute)) throw new BadRequestException('俱乐部尚未到开赛时间');
      } else if (club.scheduleType === 'once' && club.startsAt && Date.now() < club.startsAt.getTime()) {
        throw new BadRequestException('俱乐部尚未到开赛时间');
      } else if (club.scheduleType === 'none') {
        throw new BadRequestException('该俱乐部尚未安排开赛时间');
      }
      await tx.insert(pokerClubMembers).values({ clubId, userId, role: 'member' }).onConflictDoNothing();
      const existing = await tx.select().from(pokerRooms)
        .where(and(eq(pokerRooms.clubId, clubId), inArray(pokerRooms.status, ['waiting', 'playing'])))
        .limit(1).for('update');
      let selectedRoom = existing[0];
      if (selectedRoom?.status === 'playing') {
        const current = (selectedRoom.players ?? []) as unknown as RoomPlayer[];
        if (current.some((p) => p.userId === userId)) return this.mapRoomInfo(selectedRoom);
        throw new ConflictException('俱乐部牌桌正在进行本局，请本局结束后再加入');
      }
      const players = (selectedRoom?.players ?? []) as unknown as RoomPlayer[];
      if (players.some((p) => p.userId === userId)) return this.mapRoomInfo(selectedRoom!);
      if (players.length >= club.maxPlayers) throw new ConflictException('俱乐部牌桌已满');
      const buyinAmount = club.minBuyin;
      const users = await tx.select({ id: pokerUsers.id, coins: pokerUsers.coins }).from(pokerUsers)
        .where(eq(pokerUsers.id, userId)).limit(1).for('update');
      if (!users.length) throw new NotFoundException('用户不存在');
      if (users[0].coins < buyinAmount) throw new BadRequestException('金币不足，无法加入俱乐部牌桌');
      await tx.update(pokerUsers).set({ coins: sql<number>`${pokerUsers.coins} - ${buyinAmount}` }).where(eq(pokerUsers.id, userId));
      const usedSeats = new Set(players.map((p) => p.seat));
      let seat = 0;
      while (usedSeats.has(seat) && seat < club.maxPlayers) seat++;
      if (seat >= club.maxPlayers) throw new ConflictException('俱乐部牌桌已满');
      const newPlayer: RoomPlayer = { userId, seat, stack: buyinAmount, isActive: true, isFolded: false, betAmount: 0, isAllIn: false };
      const nextPlayers = [...players, newPlayer];
      if (!selectedRoom) {
        const [created] = await tx.insert(pokerRooms).values({
          roomCode, name: `俱乐部：${club.name}`, hostId: userId, clubId,
          smallBlind: club.smallBlind, bigBlind: club.bigBlind, minBuyin: club.minBuyin,
          maxBuyin: club.maxBuyin, maxPlayers: club.maxPlayers, status: 'waiting',
          isPrivate: true, players: JSON.stringify(nextPlayers), matchQueue: false,
        }).returning();
        selectedRoom = created;
      } else {
        const [updated] = await tx.update(pokerRooms).set({ players: JSON.stringify(nextPlayers), updatedAt: new Date() })
          .where(eq(pokerRooms.id, selectedRoom.id)).returning();
        selectedRoom = updated;
      }
      return this.mapRoomInfo(selectedRoom);
    });
    this.realtime.publishRoomUpdate(room.id);
    if (room.status === 'waiting' && room.players.filter((p) => p.isActive && p.stack > 0).length >= 2) {
      const clubs = await this.db.select({ autoStart: pokerClubs.autoStart }).from(pokerClubs).where(eq(pokerClubs.id, clubId)).limit(1);
      if (clubs[0]?.autoStart) {
        try {
          await this.games.startNewGame(room.id);
        } catch (error) {
          const latest = await this.getRoom(room.id, userId);
          if (latest.status !== 'playing') throw error;
        }
        return this.getRoom(room.id, userId);
      }
    }
    return room;
  }

  // ====== 创建房间 ======
  async createRoom(dto: CreateRoomDto, userId: string): Promise<RoomInfo> {
    // 参数校验
    if (dto.bigBlind !== dto.smallBlind * 2) {
      throw new BadRequestException('大盲注必须是小盲注的2倍');
    }
    if (dto.minBuyin < dto.bigBlind * 10) {
      throw new BadRequestException('最小带入金额至少是大盲注的10倍');
    }
    if (dto.maxBuyin < dto.minBuyin) {
      throw new BadRequestException('最大带入金额不能小于最小带入金额');
    }
    if (dto.buyinAmount < dto.minBuyin || dto.buyinAmount > dto.maxBuyin) {
      throw new BadRequestException('带入金额必须在最小和最大带入之间');
    }

    // 生成房间码（保证唯一）
    const roomCode = await this.generateRoomCode();

    return this.db.transaction(async (tx) => {
      // 查用户并锁定
      const users = await tx
        .select({ id: pokerUsers.id, coins: pokerUsers.coins })
        .from(pokerUsers)
        .where(eq(pokerUsers.id, userId))
        .limit(1)
        .for('update');

      if (users.length === 0) {
        throw new NotFoundException('用户不存在');
      }
      const user = users[0];
      if (user.coins <= 0 || user.coins < dto.buyinAmount) {
        throw new BadRequestException('金币不足，请联系管理员充值');
      }

      // 扣除金币
      await tx
        .update(pokerUsers)
        .set({
          coins: sql<number>`${pokerUsers.coins} - ${dto.buyinAmount}`,
        })
        .where(eq(pokerUsers.id, userId));

      // 创建房间
      const players: RoomPlayer[] = [
        {
          userId,
          seat: 0,
          stack: dto.buyinAmount,
          isActive: true,
          isFolded: false,
          betAmount: 0,
          isAllIn: false,
        },
      ];

      const inserted = await tx
        .insert(pokerRooms)
        .values({
          roomCode,
          name: dto.name,
          hostId: userId,
          smallBlind: dto.smallBlind,
          bigBlind: dto.bigBlind,
          minBuyin: dto.minBuyin,
          maxBuyin: dto.maxBuyin,
          maxPlayers: dto.maxPlayers,
          status: 'waiting',
          isPrivate: dto.isPrivate,
          players: JSON.stringify(players),
          matchQueue: false,
        })
        .returning();

      return this.mapRoomInfo(inserted[0]);
    });
  }

  // ====== 加入房间 ======
  async joinRoom(dto: JoinRoomDto, userId: string): Promise<RoomInfo> {
    const result = await this.db.transaction(async (tx) => {
      // 先锁定房间，再读取最新状态，避免多人同时加入时覆盖彼此的座位数据。
      const roomRows = await tx
        .select()
        .from(pokerRooms)
        .where(eq(pokerRooms.roomCode, dto.roomCode.toUpperCase()))
        .limit(1)
        .for('update');

      if (roomRows.length === 0) {
        throw new NotFoundException('房间不存在');
      }

      const room = roomRows[0];
      if (room.status !== 'waiting') {
        throw new BadRequestException('房间已开始游戏或已结束');
      }

      const players = room.players as unknown as RoomPlayer[];
      if (players.some((p) => p.userId === userId)) {
        throw new BadRequestException('你已经在房间中');
      }
      if (players.length >= room.maxPlayers) {
        throw new BadRequestException('房间已满');
      }
      if (dto.buyinAmount < room.minBuyin || dto.buyinAmount > room.maxBuyin) {
        throw new BadRequestException('带入金额必须在最小和最大带入之间');
      }

      // 在持有房间锁期间分配座位，保证同一座位不会被两名玩家同时取得。
      const usedSeats = new Set(players.map((p) => p.seat));
      let nextSeat = 0;
      while (usedSeats.has(nextSeat) && nextSeat < room.maxPlayers) {
        nextSeat++;
      }
      if (nextSeat >= room.maxPlayers) {
        throw new BadRequestException('房间已满');
      }

      // 再锁定用户余额；钱包扣款和房间座位更新在同一事务内提交。
      const users = await tx
        .select({ id: pokerUsers.id, coins: pokerUsers.coins })
        .from(pokerUsers)
        .where(eq(pokerUsers.id, userId))
        .limit(1)
        .for('update');

      if (users.length === 0) {
        throw new NotFoundException('用户不存在');
      }
      const user = users[0];
      if (user.coins <= 0 || user.coins < dto.buyinAmount) {
        throw new BadRequestException('金币不足，请联系管理员充值');
      }

      await tx
        .update(pokerUsers)
        .set({
          coins: sql<number>`${pokerUsers.coins} - ${dto.buyinAmount}`,
        })
        .where(eq(pokerUsers.id, userId));

      const newPlayer: RoomPlayer = {
        userId,
        seat: nextSeat,
        stack: dto.buyinAmount,
        isActive: true,
        isFolded: false,
        betAmount: 0,
        isAllIn: false,
      };
      const newPlayers = [...players, newPlayer];

      const updated = await tx
        .update(pokerRooms)
        .set({ players: JSON.stringify(newPlayers) })
        .where(eq(pokerRooms.id, room.id))
        .returning();

      if (updated.length === 0) {
        throw new ConflictException('加入房间失败，请重试');
      }

      return this.mapRoomInfo(updated[0]);
    });
    this.realtime.publishRoomUpdate(result.id);
    return result;
  }

  // ====== 离开房间 ======
  async leaveRoom(roomId: string, userId: string): Promise<RoomInfo | null> {
    const result = await this.db.transaction(async (tx) => {
      // 锁房间并在事务内检查状态，防止与开局或结算操作交叉。
      const roomRows = await tx
        .select()
        .from(pokerRooms)
        .where(eq(pokerRooms.id, roomId))
        .limit(1)
        .for('update');

      if (roomRows.length === 0) {
        throw new NotFoundException('房间不存在');
      }

      const room = roomRows[0];
      if (room.status === 'playing') {
        throw new ConflictException('当前牌局进行中，请等待本局结束后再离桌，避免筹码结算异常');
      }

      const players = room.players as unknown as RoomPlayer[];
      const playerIndex = players.findIndex((p) => p.userId === userId);
      if (playerIndex === -1) {
        throw new BadRequestException('你不在房间中');
      }

      const leavingPlayer = players[playerIndex];
      const remainingPlayers = players.filter((p) => p.userId !== userId);
      const isHost = room.hostId === userId;

      // 锁定用户余额后再退回筹码，防止同时发生的余额操作互相覆盖。
      if (leavingPlayer.stack > 0) {
        const users = await tx
          .select({ id: pokerUsers.id })
          .from(pokerUsers)
          .where(eq(pokerUsers.id, userId))
          .limit(1)
          .for('update');

        if (users.length === 0) {
          throw new NotFoundException('用户不存在');
        }

        await tx
          .update(pokerUsers)
          .set({
            coins: sql<number>`${pokerUsers.coins} + ${leavingPlayer.stack}`,
          })
          .where(eq(pokerUsers.id, userId));
      }

      if (remainingPlayers.length === 0) {
        await tx
          .update(pokerRooms)
          .set({
            status: 'finished',
            currentGameId: null,
            players: JSON.stringify([]),
          })
          .where(eq(pokerRooms.id, roomId));
        return null;
      }

      let newHostId = room.hostId;
      if (isHost) {
        const sortedBySeat = [...remainingPlayers].sort(
          (a, b) => a.seat - b.seat,
        );
        newHostId = sortedBySeat[0].userId;
      }

      const updated = await tx
        .update(pokerRooms)
        .set({
          hostId: newHostId,
          players: JSON.stringify(remainingPlayers),
        })
        .where(eq(pokerRooms.id, roomId))
        .returning();

      return this.mapRoomInfo(updated[0]);
    });
    this.realtime.publishRoomUpdate(roomId);
    return result;
  }

  // ====== 开始游戏 ======
  async startGame(roomId: string, userId: string): Promise<{ gameId: string }> {
    const result = await this.db.transaction(async (tx) => {
      // 在同一事务中锁定并重新读取房间，防止开始游戏时漏掉刚加入的玩家。
      const roomRows = await tx
        .select()
        .from(pokerRooms)
        .where(eq(pokerRooms.id, roomId))
        .limit(1)
        .for('update');

      if (roomRows.length === 0) {
        throw new NotFoundException('房间不存在');
      }

      const room = roomRows[0];
      if (room.hostId !== userId) {
        throw new ForbiddenException('只有房主可以开始游戏');
      }
      if (room.status !== 'waiting') {
        throw new BadRequestException('房间不在等待状态');
      }

      const players = room.players as unknown as RoomPlayer[];
      const activePlayers = players.filter((p) => p.isActive);
      if (activePlayers.length < 2) {
        throw new BadRequestException('至少需要2名玩家才能开始游戏');
      }

      // 发牌
      const deck = shuffleDeck(createDeck());
      let cardIndex = 0;

      const sortedPlayers = [...activePlayers].sort((a, b) => a.seat - b.seat);
      const numPlayers = sortedPlayers.length;

      // 发2张底牌
      const gamePlayers: (GamePlayer & {
        initialStack: number;
        roundBet: number;
        hasActed: boolean;
      })[] = sortedPlayers.map((p) => ({
        userId: p.userId,
        seat: p.seat,
        holeCards: [deck[cardIndex++], deck[cardIndex++]],
        stack: p.stack,
        betAmount: 0,
        isFolded: false,
        isAllIn: false,
        isActive: true,
        initialStack: p.stack,
        roundBet: 0,
        hasActed: false,
      }));

      // 确定庄家位、小盲、大盲（座位0为基准）
      const dealerSeat = sortedPlayers[numPlayers - 1].seat;
      const smallBlindSeat =
        numPlayers === 2
          ? dealerSeat
          : sortedPlayers[0].seat;
      const bigBlindSeat =
        numPlayers === 2
          ? sortedPlayers[0].seat
          : sortedPlayers[1].seat;

      const sbPlayer = gamePlayers.find((p) => p.seat === smallBlindSeat)!;
      const bbPlayer = gamePlayers.find((p) => p.seat === bigBlindSeat)!;

      const sbAmount = Math.min(room.smallBlind, sbPlayer.stack);
      const bbAmount = Math.min(room.bigBlind, bbPlayer.stack);

      sbPlayer.stack -= sbAmount;
      sbPlayer.betAmount = sbAmount;
      sbPlayer.roundBet = sbAmount;
      sbPlayer.isAllIn = sbPlayer.stack === 0;

      bbPlayer.stack -= bbAmount;
      bbPlayer.betAmount = bbAmount;
      bbPlayer.roundBet = bbAmount;
      bbPlayer.isAllIn = bbPlayer.stack === 0;

      const initialPot = sbAmount + bbAmount;

      // 第一个行动的玩家：大盲之后的第一个玩家
      const bbSeatIndex = sortedPlayers.findIndex(
        (p) => p.seat === bigBlindSeat,
      );
      const nextPlayerIndex = (bbSeatIndex + 1) % numPlayers;
      const currentPlayerSeat = sortedPlayers[nextPlayerIndex].seat;

      // 创建游戏记录
      const gameInserted = await tx
        .insert(pokerGames)
        .values({
          roomId: room.id,
          players: gamePlayers as unknown as Record<string, unknown>[],
          communityCards: [],
          pot: initialPot,
          sidePots: [],
          winnerIds: [],
          status: 'preflop',
          currentBet: bbAmount,
          currentPlayerSeat,
          dealerSeat,
          smallBlindSeat,
          bigBlindSeat,
          round: 'preflop',
          startTime: new Date(),
        })
        .returning({ id: pokerGames.id });

      const gameId = gameInserted[0].id;

      // 更新房间状态和玩家筹码（同步盲注扣除后的 stack）
      const updatedRoomPlayers = players.map((p) => {
        const gp = gamePlayers.find((gp) => gp.userId === p.userId);
        if (!gp) return p;
        return {
          ...p,
          stack: gp.stack,
          betAmount: gp.betAmount,
          isFolded: gp.isFolded,
          isAllIn: gp.isAllIn,
        };
      });

      await tx
        .update(pokerRooms)
        .set({
          status: 'playing',
          currentGameId: gameId,
          players: JSON.stringify(updatedRoomPlayers),
        })
        .where(eq(pokerRooms.id, roomId));

      return { gameId };
    });
    this.realtime.publishRoomUpdate(roomId);
    return result;
  }

  // ====== 匹配队列：加入 ======
  async joinMatchQueue(
    userId: string,
    buyinAmount: number,
  ): Promise<{ status: string }> {
    // 验证用户金币
    const users = await this.db
      .select({ coins: pokerUsers.coins })
      .from(pokerUsers)
      .where(eq(pokerUsers.id, userId))
      .limit(1);

    if (users.length === 0) {
      throw new NotFoundException('用户不存在');
    }
    if (users[0].coins <= 0 || users[0].coins < buyinAmount) {
      throw new BadRequestException('金币不足，请联系管理员充值');
    }

    // 带入金额需要在匹配区间内
    if (buyinAmount < MATCH_MIN_BUYIN || buyinAmount > MATCH_MAX_BUYIN) {
      throw new BadRequestException(
        `匹配模式带入金额需在 ${MATCH_MIN_BUYIN} - ${MATCH_MAX_BUYIN} 之间`,
      );
    }

    // 先清理该用户的旧匹配结果
    this.userMatchResults.delete(userId);

    // 加入队列
    this.matchQueue.set(userId, {
      userId,
      buyinAmount,
      joinedAt: Date.now(),
    });

    // 尝试匹配
    void this.tryMatch();
    this.ensureMatchTimer();

    return { status: 'waiting' };
  }

  // ====== 匹配队列：离开 ======
  leaveMatchQueue(userId: string): void {
    this.matchQueue.delete(userId);
    this.userMatchResults.delete(userId);
    this.ensureMatchTimer();
  }

  // ====== 匹配队列：状态 ======
  getMatchStatus(userId: string): {
    waiting: boolean;
    waitingCount: number;
    roomId: string | null;
  } {
    // 检查是否已经匹配成功
    const result = this.userMatchResults.get(userId);
    if (result) {
      // 清理结果，防止重复使用
      this.userMatchResults.delete(userId);
      return {
        waiting: false,
        waitingCount: 0,
        roomId: result.roomId,
      };
    }

    const inQueue = this.matchQueue.has(userId);
    return {
      waiting: inQueue,
      waitingCount: this.matchQueue.size,
      roomId: null,
    };
  }

  // ====== 匹配逻辑 ======
  private async tryMatch(): Promise<void> {
    if (this.matching) return;
    this.matching = true;

    try {
      const entries = Array.from(this.matchQueue.values());

      // 人数达到目标值，直接开局
      if (entries.length >= MATCH_TARGET_PLAYERS) {
        const matched = entries
          .sort((a, b) => a.joinedAt - b.joinedAt)
          .slice(0, MATCH_TARGET_PLAYERS);
        await this.createMatchRoom(matched);
        return;
      }

      // 有人等待满 30 秒：把队列里的真人尽量凑在一起；仍不足 2 人则补电脑人
      const now = Date.now();
      const waitingLong = entries.filter(
        (e) => now - e.joinedAt >= MATCH_WAIT_MS,
      );

      if (waitingLong.length === 0) {
        return;
      }

      const matched = entries
        .sort((a, b) => a.joinedAt - b.joinedAt)
        .slice(0, MATCH_TARGET_PLAYERS);

      if (matched.length < MATCH_MIN_PLAYERS) {
        const human = waitingLong.sort((a, b) => a.joinedAt - b.joinedAt)[0];
        matched.push({
          userId: BOT_USER_ID,
          buyinAmount: human.buyinAmount,
          joinedAt: now - MATCH_WAIT_MS,
        });
      }

      await this.createMatchRoom(matched);
    } finally {
      this.matching = false;
      this.ensureMatchTimer();
    }
  }

  /**
   * 单人等待时也必须有一个定时器在 30 秒后重新触发匹配，
   * 否则队列会一直停留在等待状态。
   */
  private ensureMatchTimer(): void {
    if (this.matchTimer) {
      clearTimeout(this.matchTimer);
      this.matchTimer = null;
    }
    if (this.matchQueue.size === 0) return;

    const earliest = Math.min(
      ...Array.from(this.matchQueue.values()).map((e) => e.joinedAt),
    );
    const delay = Math.max(0, earliest + MATCH_WAIT_MS - Date.now()) + 50;

    this.matchTimer = setTimeout(() => {
      this.matchTimer = null;
      void this.tryMatch();
    }, delay);
  }

  private async createMatchRoom(matched: MatchQueueEntry[]): Promise<void> {
    try {
      const roomCode = await this.generateRoomCode();

      // 注意：这里用主 db 实例，因为是异步匹配过程不处于请求事务中
      const result = await this.db.transaction(async (tx) => {
        const humanEntries = matched.filter(
          (m) => m.userId !== BOT_USER_ID,
        );

        // 先检查并锁定所有真人玩家的金币（电脑人不占用真实金币）
        const userIds = humanEntries.map((m) => m.userId);
        const userRows = await tx
          .select({ id: pokerUsers.id, coins: pokerUsers.coins })
          .from(pokerUsers)
          .where(inArray(pokerUsers.id, userIds))
          .for('update');

        // 验证所有人金币都足够
        const userCoins = new Map<string, number>();
        for (const u of userRows) {
          userCoins.set(u.id, u.coins);
        }

        for (const entry of humanEntries) {
          const coins = userCoins.get(entry.userId) ?? 0;
          if (coins < entry.buyinAmount) {
            throw new ConflictException(
              `用户 ${entry.userId} 金币不足`,
            );
          }
        }

        // 扣除所有真人玩家金币
        for (const entry of humanEntries) {
          await tx
            .update(pokerUsers)
            .set({
              coins: sql<number>`${pokerUsers.coins} - ${entry.buyinAmount}`,
            })
            .where(eq(pokerUsers.id, entry.userId));
        }

        // 创建房间玩家（按加入顺序分配座位）
        const players: RoomPlayer[] = matched.map((m, i) => ({
          userId: m.userId,
          seat: i,
          stack: m.buyinAmount,
          isActive: true,
          isFolded: false,
          betAmount: 0,
          isAllIn: false,
        }));

        // 房主 = 第一个玩家
        const hostId = matched[0].userId;

        const inserted = await tx
          .insert(pokerRooms)
          .values({
            roomCode,
            name: '快速匹配',
            hostId,
            smallBlind: MATCH_SMALL_BLIND,
            bigBlind: MATCH_BIG_BLIND,
            minBuyin: MATCH_MIN_BUYIN,
            maxBuyin: MATCH_MAX_BUYIN,
            maxPlayers: 9,
            status: 'waiting',
            isPrivate: false,
            players: JSON.stringify(players),
            matchQueue: true,
          })
          .returning({ id: pokerRooms.id });

        const roomId = inserted[0].id;

        // 自动开始游戏
        const deck = shuffleDeck(createDeck());
        let cardIndex = 0;

        const sortedPlayers = [...players].sort((a, b) => a.seat - b.seat);
        const numPlayers = sortedPlayers.length;

        const gamePlayers: (GamePlayer & {
          initialStack: number;
          roundBet: number;
          hasActed: boolean;
        })[] = sortedPlayers.map((p) => ({
          userId: p.userId,
          seat: p.seat,
          holeCards: [deck[cardIndex++], deck[cardIndex++]],
          stack: p.stack,
          betAmount: 0,
          isFolded: false,
          isAllIn: false,
          isActive: true,
          initialStack: p.stack,
          roundBet: 0,
          hasActed: false,
        }));

        const dealerSeat = sortedPlayers[numPlayers - 1].seat;
        const smallBlindSeat =
          numPlayers === 2 ? dealerSeat : sortedPlayers[0].seat;
        const bigBlindSeat =
          numPlayers === 2 ? sortedPlayers[0].seat : sortedPlayers[1].seat;

        const sbPlayer = gamePlayers.find(
          (p) => p.seat === smallBlindSeat,
        )!;
        const bbPlayer = gamePlayers.find((p) => p.seat === bigBlindSeat)!;

        const sbAmount = Math.min(MATCH_SMALL_BLIND, sbPlayer.stack);
        const bbAmount = Math.min(MATCH_BIG_BLIND, bbPlayer.stack);

        sbPlayer.stack -= sbAmount;
        sbPlayer.betAmount = sbAmount;
        sbPlayer.roundBet = sbAmount;
        sbPlayer.isAllIn = sbPlayer.stack === 0;

        bbPlayer.stack -= bbAmount;
        bbPlayer.betAmount = bbAmount;
        bbPlayer.roundBet = bbAmount;
        bbPlayer.isAllIn = bbPlayer.stack === 0;

        const initialPot = sbAmount + bbAmount;

        const bbSeatIndex = sortedPlayers.findIndex(
          (p) => p.seat === bigBlindSeat,
        );
        const nextPlayerIndex = (bbSeatIndex + 1) % numPlayers;
        const currentPlayerSeat = sortedPlayers[nextPlayerIndex].seat;

        const gameInserted = await tx
          .insert(pokerGames)
          .values({
            roomId,
            players: gamePlayers as unknown as Record<string, unknown>[],
            communityCards: [],
            pot: initialPot,
            sidePots: [],
            winnerIds: [],
            status: 'preflop',
            currentBet: bbAmount,
            currentPlayerSeat,
            dealerSeat,
            smallBlindSeat,
            bigBlindSeat,
            round: 'preflop',
            startTime: new Date(),
          })
          .returning({ id: pokerGames.id });

        const gameId = gameInserted[0].id;

        const updatedRoomPlayers = players.map((p) => {
          const gp = gamePlayers.find((gp) => gp.userId === p.userId);
          if (!gp) return p;
          return {
            ...p,
            stack: gp.stack,
            betAmount: gp.betAmount,
            isFolded: gp.isFolded,
            isAllIn: gp.isAllIn,
          };
        });

        await tx
          .update(pokerRooms)
          .set({
            status: 'playing',
            currentGameId: gameId,
            players: JSON.stringify(updatedRoomPlayers),
          })
          .where(eq(pokerRooms.id, roomId));

        return { roomId, gameId };
      });

      // 匹配成功，从队列移除并记录结果（电脑人不进入匹配队列）
      for (const entry of matched) {
        this.matchQueue.delete(entry.userId);
        if (entry.userId === BOT_USER_ID) continue;
        this.userMatchResults.set(entry.userId, {
          roomId: result.roomId,
          matchedAt: Date.now(),
        });
      }
    } catch (err) {
      // 匹配失败，不阻塞；玩家继续留在队列等待下次
      // eslint-disable-next-line no-console
      console.error('Match room creation failed:', err);
    }
  }

  // ====== 辅助方法 ======
  private async generateRoomCode(): Promise<string> {
    let attempts = 0;
    while (attempts < 50) {
      let code = '';
      for (let i = 0; i < 6; i++) {
        code +=
          ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)];
      }

      const existing = await this.db
        .select({ id: pokerRooms.id })
        .from(pokerRooms)
        .where(eq(pokerRooms.roomCode, code))
        .limit(1);

      if (existing.length === 0) {
        return code;
      }
      attempts++;
    }

    throw new ConflictException('无法生成唯一房间码，请稍后重试');
  }

  private mapRoomInfo(row: {
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
      players: (row.players as RoomPlayer[]) ?? [],
      matchQueue: row.matchQueue,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
