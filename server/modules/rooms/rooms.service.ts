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

import type {
  RoomInfo,
  RoomPlayer,
  GamePlayer,
} from '@shared/api.interface';
import { pokerRooms, pokerUsers, pokerGames } from '../../database/schema';
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
  ) {}

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

  // ====== 房间详情 ======
  async getRoom(id: string): Promise<RoomInfo> {
    const rows = await this.db
      .select()
      .from(pokerRooms)
      .where(eq(pokerRooms.id, id))
      .limit(1);

    if (rows.length === 0) {
      throw new NotFoundException('房间不存在');
    }

    return this.mapRoomInfo(rows[0]);
  }

  // ====== 创建房间 ======
  async createRoom(dto: CreateRoomDto, userId: string): Promise<RoomInfo> {
    // 参数校验
    if (dto.bigBlind <= dto.smallBlind) {
      throw new BadRequestException('大盲注必须大于小盲注');
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
    const roomRows = await this.db
      .select()
      .from(pokerRooms)
      .where(eq(pokerRooms.roomCode, dto.roomCode.toUpperCase()))
      .limit(1);

    if (roomRows.length === 0) {
      throw new NotFoundException('房间不存在');
    }

    const room = roomRows[0];
    if (room.status !== 'waiting') {
      throw new BadRequestException('房间已开始游戏或已结束');
    }

    const players = room.players as unknown as RoomPlayer[];
    if (players.length >= room.maxPlayers) {
      throw new BadRequestException('房间已满');
    }
    if (players.some((p) => p.userId === userId)) {
      throw new BadRequestException('你已经在房间中');
    }
    if (dto.buyinAmount < room.minBuyin || dto.buyinAmount > room.maxBuyin) {
      throw new BadRequestException('带入金额必须在最小和最大带入之间');
    }

    // 找下一个空座位
    const usedSeats = new Set(players.map((p) => p.seat));
    let nextSeat = 0;
    while (usedSeats.has(nextSeat)) {
      nextSeat++;
    }

    return this.db.transaction(async (tx) => {
      // 锁定用户
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

      // 更新房间玩家
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

      return this.mapRoomInfo(updated[0]);
    });
  }

  // ====== 离开房间 ======
  async leaveRoom(roomId: string, userId: string): Promise<RoomInfo | null> {
    const roomRows = await this.db
      .select()
      .from(pokerRooms)
      .where(eq(pokerRooms.id, roomId))
      .limit(1);

    if (roomRows.length === 0) {
      throw new NotFoundException('房间不存在');
    }

    const room = roomRows[0];
    const players = room.players as unknown as RoomPlayer[];
    const playerIndex = players.findIndex((p) => p.userId === userId);

    if (playerIndex === -1) {
      throw new BadRequestException('你不在房间中');
    }

    const leavingPlayer = players[playerIndex];
    const remainingPlayers = players.filter((p) => p.userId !== userId);
    const isHost = room.hostId === userId;

    return this.db.transaction(async (tx) => {
      // 退回筹码
      if (leavingPlayer.stack > 0) {
        await tx
          .update(pokerUsers)
          .set({
            coins: sql<number>`${pokerUsers.coins} + ${leavingPlayer.stack}`,
          })
          .where(eq(pokerUsers.id, userId));
      }

      // 最后一个人离开 -> 房间结束
      if (remainingPlayers.length === 0) {
        await tx
          .update(pokerRooms)
          .set({
            status: 'finished',
            players: JSON.stringify([]),
          })
          .where(eq(pokerRooms.id, roomId));
        return null;
      }

      // 房主离开 -> 转移给座位号最小的
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
  }

  // ====== 开始游戏 ======
  async startGame(roomId: string, userId: string): Promise<{ gameId: string }> {
    const roomRows = await this.db
      .select()
      .from(pokerRooms)
      .where(eq(pokerRooms.id, roomId))
      .limit(1);

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

    return this.db.transaction(async (tx) => {
      // 发牌
      const deck = shuffleDeck(createDeck());
      let cardIndex = 0;

      const sortedPlayers = [...activePlayers].sort((a, b) => a.seat - b.seat);
      const numPlayers = sortedPlayers.length;

      // 发2张底牌
      const gamePlayers: GamePlayer[] = sortedPlayers.map((p) => ({
        userId: p.userId,
        seat: p.seat,
        holeCards: [deck[cardIndex++], deck[cardIndex++]],
        stack: p.stack,
        betAmount: 0,
        isFolded: false,
        isAllIn: false,
        isActive: true,
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
      sbPlayer.isAllIn = sbPlayer.stack === 0;

      bbPlayer.stack -= bbAmount;
      bbPlayer.betAmount = bbAmount;
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
          players: JSON.stringify(gamePlayers),
          communityCards: JSON.stringify([]),
          pot: initialPot,
          sidePots: JSON.stringify([]),
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

        const gamePlayers: GamePlayer[] = sortedPlayers.map((p) => ({
          userId: p.userId,
          seat: p.seat,
          holeCards: [deck[cardIndex++], deck[cardIndex++]],
          stack: p.stack,
          betAmount: 0,
          isFolded: false,
          isAllIn: false,
          isActive: true,
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
        sbPlayer.isAllIn = sbPlayer.stack === 0;

        bbPlayer.stack -= bbAmount;
        bbPlayer.betAmount = bbAmount;
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
            players: JSON.stringify(gamePlayers),
            communityCards: JSON.stringify([]),
            pot: initialPot,
            sidePots: JSON.stringify([]),
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
