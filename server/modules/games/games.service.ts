import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { eq, desc, count, inArray, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { DRIZZLE_DATABASE } from '../../database/database.constants';

import type { GameInfo, GamePlayer, SidePot } from '@shared/api.interface';
import {
  pokerGames,
  pokerRooms,
  pokerUsers,
  pokerGamePlayers,
} from '../../database/schema';
import {
  createDeck,
  shuffleDeck,
  determineWinners,
  calculateSidePots,
} from '../../common/utils/poker';
import { BOT_USER_ID, decideBotAction } from './bot';

// 内部使用的扩展玩家类型（JSONB 存储，返回前端时裁剪）
interface InternalGamePlayer extends GamePlayer {
  initialStack: number;
  roundBet: number;
  hasActed: boolean;
}

interface RoomPlayerFromJson {
  userId: string;
  seat: number;
  stack: number;
  isActive: boolean;
  isFolded: boolean;
  betAmount: number;
  isAllIn: boolean;
}

interface DbGame {
  id: string;
  roomId: string;
  players: InternalGamePlayer[];
  communityCards: string[];
  pot: number;
  sidePots: SidePot[];
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
}

const TURN_TIMEOUT_MS = 30_000;
const TURN_TIMEOUT_SECONDS = TURN_TIMEOUT_MS / 1000;


@Injectable()
export class GamesService {
  private readonly logger = new Logger(GamesService.name);
  private readonly botTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly turnTimers = new Map<
    string,
    { timer: ReturnType<typeof setTimeout>; deadline: number }
  >();
  private readonly turnScheduling = new Set<string>();

  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
  ) {}

  /**
   * 由 rooms 模块调用：开始新一局游戏
   */
  async startNewGame(roomId: string): Promise<string> {
    const gameId = await this.db.transaction(async tx => {
      const rooms = await tx
        .select({
          id: pokerRooms.id,
          smallBlind: pokerRooms.smallBlind,
          bigBlind: pokerRooms.bigBlind,
          maxPlayers: pokerRooms.maxPlayers,
          players: pokerRooms.players,
        })
        .from(pokerRooms)
        .where(eq(pokerRooms.id, roomId))
        .limit(1);

      if (rooms.length === 0) {
        throw new NotFoundException('房间不存在');
      }

      const room = rooms[0];
      const roomPlayers = (room.players ?? []) as unknown as RoomPlayerFromJson[];
      const activePlayers = roomPlayers.filter(p => p.isActive && p.stack > 0);

      if (activePlayers.length < 2) {
        throw new BadRequestException('至少需要2名活跃玩家才能开始游戏');
      }

      const smallBlind = room.smallBlind;
      const bigBlind = room.bigBlind;
      const maxPlayers = room.maxPlayers;

      // 按座位排序
      const sorted = [...activePlayers].sort((a, b) => a.seat - b.seat);

      // 确定位置
      const dealerSeat = sorted[0].seat;
      const smallBlindSeat = this.nextActiveSeat(sorted, dealerSeat, maxPlayers);
      const bigBlindSeat = this.nextActiveSeat(sorted, smallBlindSeat, maxPlayers);

      // 洗牌发牌
      let deck = shuffleDeck(createDeck());

      const gamePlayers: InternalGamePlayer[] = sorted.map(p => {
        const holeCards = [deck.pop()!, deck.pop()!];
        return {
          userId: p.userId,
          seat: p.seat,
          holeCards,
          stack: p.stack,
          betAmount: 0,
          isFolded: false,
          isAllIn: false,
          isActive: true,
          initialStack: p.stack,
          roundBet: 0,
          hasActed: false,
        };
      });

      // 收取盲注（翻牌前的盲注算在 roundBet 中）
      let pot = 0;

      const sbPlayer = this.findBySeat(gamePlayers, smallBlindSeat)!;
      const sbAmount = Math.min(smallBlind, sbPlayer.stack);
      sbPlayer.stack -= sbAmount;
      sbPlayer.roundBet = sbAmount;
      sbPlayer.betAmount = sbAmount;
      pot += sbAmount;
      if (sbPlayer.stack === 0) sbPlayer.isAllIn = true;

      const bbPlayer = this.findBySeat(gamePlayers, bigBlindSeat)!;
      const bbAmount = Math.min(bigBlind, bbPlayer.stack);
      bbPlayer.stack -= bbAmount;
      bbPlayer.roundBet = bbAmount;
      bbPlayer.betAmount = bbAmount;
      pot += bbAmount;
      if (bbPlayer.stack === 0) bbPlayer.isAllIn = true;

      // 大盲位玩家的 hasActed 保持 false——因为他还有机会在 preflop 行动
      // （过牌权 / 加注权）

      // 当前玩家：大盲之后第一个可行动玩家
      const currentPlayerSeat = this.nextActionableSeat(
        gamePlayers,
        bigBlindSeat,
        maxPlayers,
      );

      // 计算边池（盲注可能导致全下边池）
      const sideResult = calculateSidePots(
        gamePlayers.map(p => ({
          userId: p.userId,
          seat: p.seat,
          betAmount: p.betAmount,
          isFolded: p.isFolded,
          isAllIn: p.isAllIn,
        })),
      );

      // 写入游戏
      const result = await tx
        .insert(pokerGames)
        .values({
          roomId,
          players: gamePlayers as unknown as Record<string, unknown>[],
          communityCards: [],
          pot,
          sidePots: sideResult.sidePots as unknown as Record<string, unknown>[],
          winnerIds: [],
          status: 'preflop',
          currentBet: bigBlind,
          currentPlayerSeat,
          dealerSeat,
          smallBlindSeat,
          bigBlindSeat,
          round: 'preflop',
          startTime: new Date(),
        })
        .returning({ id: pokerGames.id });

      const gameId = result[0].id;

      // 更新房间
      await tx
        .update(pokerRooms)
        .set({
          status: 'playing',
          currentGameId: gameId,
          players: roomPlayers.map(rp => {
            const gp = gamePlayers.find(g => g.userId === rp.userId);
            if (gp) {
              return {
                ...rp,
                stack: gp.stack,
                betAmount: gp.betAmount,
                isFolded: gp.isFolded,
                isAllIn: gp.isAllIn,
              };
            }
            return rp;
          }) as unknown as Record<string, unknown>[],
        })
        .where(eq(pokerRooms.id, roomId));

      return gameId;
    });
    // 开局后立即挂上计时器，即使客户端还没开始轮询也会按时自动弃牌。
    this.scheduleBotTurn(gameId);
    this.scheduleTurnTimeout(gameId, true);
    return gameId;
  }

  /**
   * 获取游戏详情
   */
  async getGame(gameId: string, userId: string): Promise<GameInfo> {
    const games = await this.db
      .select()
      .from(pokerGames)
      .where(eq(pokerGames.id, gameId))
      .limit(1);

    if (games.length === 0) {
      throw new NotFoundException('游戏不存在');
    }

    const game = games[0] as unknown as DbGame;
    this.scheduleBotTurn(game.id);
    this.scheduleTurnTimeout(game.id);
    return this.sanitizeGameInfo(game, userId);
  }

  private async loadGame(gameId: string): Promise<DbGame | null> {
    const rows = await this.db
      .select()
      .from(pokerGames)
      .where(eq(pokerGames.id, gameId))
      .limit(1);
    return rows.length > 0 ? (rows[0] as unknown as DbGame) : null;
  }

  /**
   * 如果当前行动座位是电脑人，则安排一次延时自动行动。
   * 前端本来就在轮询牌桌状态，因此服务重启后也能通过 getGame 自动恢复。
   */
  private scheduleBotTurn(gameId: string): void {
    if (this.botTimers.has(gameId)) return;

    void (async () => {
      try {
        const game = await this.loadGame(gameId);
        if (!game || game.status === 'finished' || game.status === 'waiting') {
          return;
        }

        const bot = game.players.find(p => p.userId === BOT_USER_ID);
        if (
          !bot ||
          !bot.isActive ||
          bot.isFolded ||
          bot.isAllIn ||
          game.currentPlayerSeat !== bot.seat
        ) {
          return;
        }

        const timer = setTimeout(() => {
          this.botTimers.delete(gameId);
          void this.runBotTurn(gameId);
        }, 1500);
        this.botTimers.set(gameId, timer);
      } catch (error) {
        this.logger.warn(`电脑人调度失败：${(error as Error).message}`);
      }
    })();
  }

  /**
   * 人类玩家 30 秒思考时间。服务端只保留一个计时器；
   * 前端轮询 getGame 时可依据 updatedAt 恢复，部署重启后也不会丢失剩余时间。
   */
  private scheduleTurnTimeout(gameId: string, force = false): void {
    if (this.turnScheduling.has(gameId)) return;
    const existing = this.turnTimers.get(gameId);
    if (existing && !force) return;

    this.turnScheduling.add(gameId);
    void (async () => {
      try {
        const game = await this.loadGame(gameId);
        if (!game || game.status === 'finished' || game.status === 'waiting') {
          if (existing) clearTimeout(existing.timer);
          this.turnTimers.delete(gameId);
          return;
        }

        const current = game.players.find(
          p => p.seat === game.currentPlayerSeat,
        );
        if (!current || current.userId === BOT_USER_ID || current.isFolded || current.isAllIn) {
          if (existing) clearTimeout(existing.timer);
          this.turnTimers.delete(gameId);
          return;
        }

        const deadline = new Date(game.updatedAt).getTime() + TURN_TIMEOUT_MS;
        const latest = this.turnTimers.get(gameId);
        if (latest && !force && latest.deadline === deadline) return;

        if (latest) clearTimeout(latest.timer);
        const delay = Math.max(0, deadline - Date.now());
        const timer = setTimeout(() => {
          this.turnTimers.delete(gameId);
          void this.runTurnTimeout(gameId);
        }, delay);
        this.turnTimers.set(gameId, { timer, deadline });
      } catch (error) {
        this.logger.warn(`思考计时器调度失败：${(error as Error).message}`);
      } finally {
        this.turnScheduling.delete(gameId);
      }
    })();
  }

  private async runTurnTimeout(gameId: string): Promise<void> {
    try {
      const game = await this.loadGame(gameId);
      if (!game || game.status === 'finished' || game.status === 'waiting') {
        return;
      }

      const current = game.players.find(
        p => p.seat === game.currentPlayerSeat,
      );
      if (
        !current ||
        current.userId === BOT_USER_ID ||
        current.isFolded ||
        current.isAllIn
      ) {
        return;
      }

      // 如果刚好有人行动，updatedAt 会被刷新，这里就不再重复自动操作。
      if (Date.now() < new Date(game.updatedAt).getTime() + TURN_TIMEOUT_MS) {
        this.scheduleTurnTimeout(gameId);
        return;
      }

      const autoAction = 'fold' as const;
      this.logger.log(`玩家 ${current.userId} 思考超时，自动弃牌`);
      await this.playerAction(gameId, current.userId, autoAction);
    } catch (error) {
      this.logger.warn(`思考超时自动行动失败：${(error as Error).message}`);
    }
  }

  private async runBotTurn(gameId: string): Promise<void> {
    let shouldReschedule = false;
    try {
      const game = await this.loadGame(gameId);
      if (!game || game.status === 'finished' || game.status === 'waiting') {
        return;
      }

      const bot = game.players.find(p => p.userId === BOT_USER_ID);
      if (
        !bot ||
        !bot.isActive ||
        bot.isFolded ||
        bot.isAllIn ||
        game.currentPlayerSeat !== bot.seat
      ) {
        return;
      }

      const roomRows = await this.db
        .select({ bigBlind: pokerRooms.bigBlind })
        .from(pokerRooms)
        .where(eq(pokerRooms.id, game.roomId))
        .limit(1);
      if (roomRows.length === 0) return;

      const activePlayers = game.players.filter(
        p => p.isActive && !p.isFolded,
      ).length;

      const decision = decideBotAction({
        holeCards: bot.holeCards || [],
        communityCards: game.communityCards || [],
        pot: game.pot,
        currentBet: game.currentBet,
        roundBet:
          typeof bot.roundBet === 'number' ? bot.roundBet : bot.betAmount,
        stack: bot.stack,
        bigBlind: roomRows[0].bigBlind,
        activePlayers,
      });

      this.logger.log(
        `电脑人行动：${decision.action}${
          decision.amount ? ` ${decision.amount}` : ''
        }`,
      );
      await this.playerAction(
        gameId,
        BOT_USER_ID,
        decision.action,
        decision.amount,
      );
      shouldReschedule = true;
    } catch (error) {
      // 不在这里无限重试；前端下一次轮询 getGame 会重新调度
      this.logger.warn(`电脑人行动失败：${(error as Error).message}`);
    } finally {
      if (shouldReschedule) {
        this.scheduleBotTurn(gameId);
      }
    }
  }

  /**
   * 玩家操作
   */
  async playerAction(
    gameId: string,
    userId: string,
    action: 'fold' | 'check' | 'call' | 'raise' | 'allin',
    amount?: number,
  ): Promise<GameInfo> {
    const result = await this.db.transaction(async tx => {
      const games = await tx
        .select()
        .from(pokerGames)
        .where(eq(pokerGames.id, gameId))
        .limit(1)
        .for('update');

      if (games.length === 0) {
        throw new NotFoundException('游戏不存在');
      }

      const game = games[0] as unknown as DbGame;

      if (game.status === 'finished' || game.status === 'waiting') {
        throw new BadRequestException('游戏已结束或未开始');
      }

      // 兼容旧版本写入的牌局数据：旧数据缺少 roundBet / hasActed / initialStack，
      // 直接参与运算会产生 NaN，导致更新 pot 时报 22P02。
      const players: InternalGamePlayer[] = game.players.map(p => ({
        ...p,
        initialStack:
          typeof p.initialStack === 'number' ? p.initialStack : p.stack,
        roundBet:
          typeof p.roundBet === 'number'
            ? p.roundBet
            : typeof p.betAmount === 'number'
              ? p.betAmount
              : 0,
        hasActed: typeof p.hasActed === 'boolean' ? p.hasActed : false,
      }));
      game.players = players;

      const player = players.find(p => p.userId === userId);

      if (!player) {
        throw new ForbiddenException('您不在此游戏中');
      }

      if (player.isFolded || player.isAllIn) {
        throw new BadRequestException('您已弃牌或全下，无法操作');
      }

      if (game.currentPlayerSeat !== player.seat) {
        throw new BadRequestException('还没轮到您操作');
      }

      // 读取房间信息获取大盲
      const roomRows = await tx
        .select({
          bigBlind: pokerRooms.bigBlind,
          maxPlayers: pokerRooms.maxPlayers,
        })
        .from(pokerRooms)
        .where(eq(pokerRooms.id, game.roomId))
        .limit(1);

      if (roomRows.length === 0) {
        throw new NotFoundException('房间不存在');
      }

      const bigBlind = roomRows[0].bigBlind;
      const maxPlayers = roomRows[0].maxPlayers;
      const currentBet = game.currentBet;

      // 执行操作
      switch (action) {
        case 'fold':
          player.isFolded = true;
          player.hasActed = true;
          break;

        case 'check':
          if (player.roundBet < currentBet) {
            throw new BadRequestException('当前有下注，不能过牌');
          }
          player.hasActed = true;
          break;

        case 'call': {
          const needToCall = currentBet - player.roundBet;
          if (needToCall <= 0) {
            throw new BadRequestException('无需跟注');
          }
          if (player.stack <= needToCall) {
            // 筹码不够，全下跟注
            const allInAmt = player.stack;
            player.roundBet += allInAmt;
            player.betAmount += allInAmt;
            player.stack = 0;
            player.isAllIn = true;
          } else {
            player.stack -= needToCall;
            player.roundBet += needToCall;
            player.betAmount += needToCall;
          }
          player.hasActed = true;
          break;
        }

        case 'raise': {
          if (amount === undefined || !Number.isFinite(amount)) {
            throw new BadRequestException('加注必须指定金额');
          }
          const amountInt = Math.floor(amount);
          const minRaiseTotal = currentBet + bigBlind;
          const maxTotal = player.roundBet + player.stack;
          if (amountInt < minRaiseTotal) {
            throw new BadRequestException(
              `加注金额至少为 ${minRaiseTotal}`,
            );
          }
          if (amountInt > maxTotal) {
            throw new BadRequestException(
              `加注金额不能超过 ${maxTotal}`,
            );
          }
          const totalNeeded = amountInt - player.roundBet;
          if (player.stack <= totalNeeded) {
            // 筹码不够，全下加注
            const allInAmt = player.stack;
            const newBet = player.roundBet + allInAmt;
            player.betAmount += allInAmt;
            player.roundBet = newBet;
            player.stack = 0;
            player.isAllIn = true;
            // 如果全下金额 > currentBet，更新 currentBet 并重置其他人 hasActed
            if (newBet > currentBet) {
              game.currentBet = newBet;
              this.resetHasActedAfterRaise(players, player.seat, maxPlayers);
            }
          } else {
            player.stack -= totalNeeded;
            player.roundBet = amountInt;
            player.betAmount += totalNeeded;
            game.currentBet = amountInt;
            // 加注后，其他玩家需要重新行动
            this.resetHasActedAfterRaise(players, player.seat, maxPlayers);
          }
          player.hasActed = true;
          break;
        }

        case 'allin': {
          if (player.stack <= 0) {
            throw new BadRequestException('您没有筹码可以全下');
          }
          const allInAmt = player.stack;
          const newBet = player.roundBet + allInAmt;
          player.betAmount += allInAmt;
          player.roundBet = newBet;
          player.stack = 0;
          player.isAllIn = true;

          if (newBet > currentBet) {
            game.currentBet = newBet;
            this.resetHasActedAfterRaise(players, player.seat, maxPlayers);
          }
          player.hasActed = true;
          break;
        }
      }

      // 重算底池
      game.pot = players.reduce((s, p) => s + p.betAmount, 0);

      // 计算边池
      const sideResult = calculateSidePots(
        players.map(p => ({
          userId: p.userId,
          seat: p.seat,
          betAmount: p.betAmount,
          isFolded: p.isFolded,
          isAllIn: p.isAllIn,
        })),
      );
      game.sidePots = sideResult.sidePots;

      // 检查只剩一人
      const activeNonFolded = players.filter(p => !p.isFolded && p.isActive);
      if (activeNonFolded.length === 1) {
        await this.finalizeByFold(tx, game, activeNonFolded[0].userId);
        return this.sanitizeGameInfo(game, userId);
      }

      // 推进到下一个玩家
      let nextSeat = this.nextActionableSeat(players, player.seat, maxPlayers);

      // 检查轮次是否结束
      const roundComplete = this.isRoundComplete(players, game.currentBet);

      if (roundComplete) {
        // 进入下一轮
        const finished = this.advanceRound(game, players, maxPlayers);
        if (finished) {
          // 摊牌结算
          await this.finalizeShowdown(tx, game);
        } else {
          // 新一轮开始：找到第一个行动的玩家
          const firstSeat = this.firstToActSeat(
            players,
            game.dealerSeat,
            maxPlayers,
          );
          game.currentPlayerSeat = firstSeat;
        }
      } else {
        game.currentPlayerSeat = nextSeat;
      }

      // 更新数据库
      const actionAt = new Date();
      game.updatedAt = actionAt;
      await tx
        .update(pokerGames)
        .set({
          players: players as unknown as Record<string, unknown>[],
          communityCards: game.communityCards,
          pot: game.pot,
          sidePots: game.sidePots as unknown as Record<string, unknown>[],
          winnerIds: game.winnerIds,
          status: game.status,
          currentBet: game.currentBet,
          currentPlayerSeat: game.currentPlayerSeat,
          round: game.round,
          updatedAt: actionAt,
        })
        .where(eq(pokerGames.id, gameId));

      // 同步房间玩家 stack
      if (game.status !== 'finished') {
        await this.syncRoomStack(tx, game.roomId, players);
      }

      return this.sanitizeGameInfo(game, userId);
    });

    // 若下一个行动者是电脑人，立即安排自动行动；人类玩家则重置 30 秒思考计时。
    this.scheduleBotTurn(gameId);
    this.scheduleTurnTimeout(gameId, true);
    return result;
  }
  async getMyRecords(
    userId: string,
    page: number,
    pageSize: number,
  ): Promise<{
    items: {
      id: string;
      gameId: string;
      userId: string;
      buyIn: number;
      finalStack: number;
      profit: number;
      holeCards: string[] | null;
      isWinner: boolean;
      createdAt: string;
    }[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const offset = (page - 1) * pageSize;

    const [countResult, records] = await Promise.all([
      this.db
        .select({ count: count() })
        .from(pokerGamePlayers)
        .where(eq(pokerGamePlayers.userId, userId)),
      this.db
        .select()
        .from(pokerGamePlayers)
        .where(eq(pokerGamePlayers.userId, userId))
        .orderBy(desc(pokerGamePlayers.createdAt))
        .limit(pageSize)
        .offset(offset),
    ]);

    const total = Number(countResult[0]?.count ?? 0);
    const items = records.map(r => ({
      id: r.id,
      gameId: r.gameId,
      userId: r.userId,
      buyIn: r.buyIn,
      finalStack: r.finalStack,
      profit: r.profit,
      holeCards: r.holeCards ?? null,
      isWinner: r.isWinner,
      createdAt: r.createdAt.toISOString(),
    }));

    return { items, total, page, pageSize };
  }

  async getCoinRank(limit: number = 20): Promise<{
    userId: string;
    nickname: string;
    value: number;
    rank: number;
  }[]> {
    const rows = await this.db
      .select({
        id: pokerUsers.id,
        nickname: pokerUsers.nickname,
        coins: pokerUsers.coins,
      })
      .from(pokerUsers)
      .orderBy(desc(pokerUsers.coins))
      .limit(limit);

    return rows.map((row, index) => ({
      userId: row.id,
      nickname: row.nickname,
      value: row.coins,
      rank: index + 1,
    }));
  }

  async getWinRank(limit: number = 20): Promise<{
    userId: string;
    nickname: string;
    value: number;
    rank: number;
  }[]> {
    const rows = await this.db
      .select({
        userId: pokerGamePlayers.userId,
        wins: sql<number>`count(*)`,
      })
      .from(pokerGamePlayers)
      .where(eq(pokerGamePlayers.isWinner, true))
      .groupBy(pokerGamePlayers.userId)
      .orderBy(sql`count(*) desc`)
      .limit(limit);

    if (rows.length === 0) return [];

    const userIds = rows.map((row) => row.userId);
    const userRows = await this.db
      .select({ id: pokerUsers.id, nickname: pokerUsers.nickname })
      .from(pokerUsers)
      .where(inArray(pokerUsers.id, userIds));

    const nicknameMap = new Map<string, string>();
    for (const u of userRows) {
      nicknameMap.set(u.id, u.nickname);
    }

    return rows.map((row, index) => ({
      userId: row.userId,
      nickname: nicknameMap.get(row.userId) || '未知玩家',
      value: Number(row.wins),
      rank: index + 1,
    }));
  }

  // ========== 私有方法 ==========

  private findBySeat(
    players: InternalGamePlayer[],
    seat: number,
  ): InternalGamePlayer | undefined {
    return players.find(p => p.seat === seat);
  }

  /**
   * 找下一个有玩家（活跃）的座位
   */
  private nextActiveSeat(
    players: { seat: number; isActive?: boolean }[],
    fromSeat: number,
    maxPlayers: number,
  ): number {
    for (let i = 1; i <= maxPlayers; i++) {
      const seat = (fromSeat + i) % maxPlayers;
      const p = players.find(pl => pl.seat === seat && pl.isActive !== false);
      if (p) return seat;
    }
    return fromSeat;
  }

  /**
   * 找下一个可行动（未弃牌、未全下、活跃）的玩家座位
   */
  private nextActionableSeat(
    players: InternalGamePlayer[],
    fromSeat: number,
    maxPlayers: number,
  ): number | null {
    for (let i = 1; i <= maxPlayers; i++) {
      const seat = (fromSeat + i) % maxPlayers;
      const p = players.find(pl => pl.seat === seat);
      if (p && !p.isFolded && !p.isAllIn && p.isActive) {
        return seat;
      }
    }
    return null;
  }

  /**
   * 翻牌后第一个行动的座位。
   * 两人单挑时，庄家就是小盲，翻牌后应由庄家/小盲先行动；
   * 三人及以上时，庄家之后第一位可行动玩家先行动。
   */
  private firstToActSeat(
    players: InternalGamePlayer[],
    dealerSeat: number,
    maxPlayers: number,
  ): number | null {
    const actionable = players.filter(
      p => p.isActive && !p.isFolded && !p.isAllIn,
    );
    if (actionable.length === 2) {
      const dealer = players.find(p => p.seat === dealerSeat);
      if (dealer && dealer.isActive && !dealer.isFolded && !dealer.isAllIn) {
        return dealerSeat;
      }
    }
    return this.nextActionableSeat(players, dealerSeat, maxPlayers);
  }

  /**
   * 加注后重置其他玩家的 hasActed 状态
   * （当前玩家保持 hasActed=true，其他未弃牌未全下的重置为 false）
   */
  private resetHasActedAfterRaise(
    players: InternalGamePlayer[],
    raiserSeat: number,
    _maxPlayers: number,
  ): void {
    for (const p of players) {
      if (p.seat === raiserSeat) continue;
      if (p.isFolded || p.isAllIn) continue;
      p.hasActed = false;
    }
  }

  /**
   * 判断轮次是否结束
   * 条件：所有可行动（未弃牌、未全下）玩家都 hasActed=true
   * 且他们的 roundBet 都等于 currentBet
   */
  private isRoundComplete(
    players: InternalGamePlayer[],
    currentBet: number,
  ): boolean {
    const actionable = players.filter(p => !p.isFolded && !p.isAllIn && p.isActive);
    if (actionable.length === 0) return true;

    const allActed = actionable.every(p => p.hasActed);
    if (!allActed) return false;

    const allMatched = actionable.every(p => p.roundBet >= currentBet);
    return allMatched;
  }

  /**
   * 推进到下一轮；返回 true 表示游戏结束（到达 showdown）
   */
  private advanceRound(
    game: DbGame,
    players: InternalGamePlayer[],
    maxPlayers: number,
  ): boolean {
    const order = ['preflop', 'flop', 'turn', 'river', 'showdown'];
    const idx = order.indexOf(game.round);
    if (idx < 0 || idx >= order.length - 1) return true;

    const nextRound = order[idx + 1];

    // 发公共牌
    if (nextRound === 'flop') {
      const deck = this.remainingDeck(players, game.communityCards);
      game.communityCards.push(deck.pop()!, deck.pop()!, deck.pop()!);
    } else if (nextRound === 'turn' || nextRound === 'river') {
      const deck = this.remainingDeck(players, game.communityCards);
      game.communityCards.push(deck.pop()!);
    }

    if (nextRound === 'showdown') {
      game.round = 'showdown';
      game.status = 'showdown';
      return true;
    }

    game.round = nextRound;
    game.status = nextRound;
    game.currentBet = 0;

    // 重置 roundBet 和 hasActed
    for (const p of players) {
      p.roundBet = 0;
      p.hasActed = false;
    }

    // 检查下一轮是否有可行动玩家
    const firstSeat = this.firstToActSeat(players, game.dealerSeat, maxPlayers);
    if (firstSeat === null) {
      // 没有可行动玩家（全都全下了），自动发完剩余公共牌后进入摊牌
      while (game.round !== 'river') {
        const rIdx = order.indexOf(game.round);
        const next = order[rIdx + 1];
        if (next === 'showdown') break;
        if (next === 'flop') {
          const deck = this.remainingDeck(players, game.communityCards);
          game.communityCards.push(deck.pop()!, deck.pop()!, deck.pop()!);
        } else if (next === 'turn' || next === 'river') {
          const deck = this.remainingDeck(players, game.communityCards);
          game.communityCards.push(deck.pop()!);
        }
        game.round = next;
        game.status = next;
      }
      game.round = 'showdown';
      game.status = 'showdown';
      return true;
    }

    return false;
  }

  /**
   * 计算剩余牌（按从牌堆取牌的逻辑，重新洗牌）
   */
  private remainingDeck(
    players: InternalGamePlayer[],
    communityCards: string[],
  ): string[] {
    const full = createDeck();
    const used = new Set<string>();
    for (const p of players) {
      for (const c of p.holeCards) used.add(c);
    }
    for (const c of communityCards) used.add(c);
    return shuffleDeck(full.filter(c => !used.has(c)));
  }

  /**
   * 弃牌获胜结算
   */
  private async finalizeByFold(
    tx: PostgresJsDatabase,
    game: DbGame,
    winnerUserId: string,
  ): Promise<void> {
    const players = game.players;
    const winner = players.find(p => p.userId === winnerUserId)!;
    winner.stack += game.pot;

    await this.recordResults(tx, game, [winnerUserId]);

    game.status = 'finished';
    game.round = 'showdown';
    game.winnerIds = [winnerUserId];
    game.endTime = new Date();

    await tx
      .update(pokerGames)
      .set({
        players: players as unknown as Record<string, unknown>[],
        pot: game.pot,
        winnerIds: [winnerUserId],
        status: 'finished',
        endTime: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(pokerGames.id, game.id));

    await this.resetRoom(tx, game.roomId, players);
  }

  /**
   * 摊牌结算
   */
  private async finalizeShowdown(
    tx: PostgresJsDatabase,
    game: DbGame,
  ): Promise<void> {
    const players = game.players;

    const { winners } = determineWinners(
      players.map(p => ({
        userId: p.userId,
        holeCards: p.holeCards,
        isFolded: p.isFolded,
        isAllIn: p.isAllIn,
        seat: p.seat,
        betAmount: p.betAmount,
      })),
      game.communityCards,
      game.pot,
      game.sidePots,
    );

    for (const w of winners) {
      const p = players.find(pl => pl.userId === w.userId);
      if (p) p.stack += w.amount;
    }

    const winnerIds = winners.map(w => w.userId);

    await this.recordResults(tx, game, winnerIds);

    game.status = 'finished';
    game.winnerIds = winnerIds;
    game.endTime = new Date();

    await tx
      .update(pokerGames)
      .set({
        players: players as unknown as Record<string, unknown>[],
        pot: game.pot,
        winnerIds,
        status: 'finished',
        endTime: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(pokerGames.id, game.id));

    await this.resetRoom(tx, game.roomId, players);
  }

  /**
   * 写入战绩 + 更新用户金币
   */
  private async recordResults(
    tx: PostgresJsDatabase,
    game: DbGame,
    winnerIds: string[],
  ): Promise<void> {
    const winnerSet = new Set(winnerIds);

    for (const p of game.players) {
      const buyIn = p.initialStack;
      const finalStack = p.stack;
      const profit = finalStack - buyIn;

      await tx.insert(pokerGamePlayers).values({
        gameId: game.id,
        userId: p.userId,
        buyIn,
        finalStack,
        profit,
        holeCards: p.isFolded ? [] : p.holeCards,
        isWinner: winnerSet.has(p.userId),
      });

      // 买入时已从金币余额扣除，筹码保存在房间中；
      // 摊牌后不再改动金币余额，离开房间时统一按剩余筹码退回，
      // 避免“盈亏入账 + 筹码退回”重复计算。
    }
  }

  /**
   * 游戏结束后重置房间为 waiting 状态
   */
  private async resetRoom(
    tx: PostgresJsDatabase,
    roomId: string,
    gamePlayers: InternalGamePlayer[],
  ): Promise<void> {
    const rooms = await tx
      .select({ players: pokerRooms.players })
      .from(pokerRooms)
      .where(eq(pokerRooms.id, roomId))
      .limit(1);

    if (rooms.length === 0) return;

    const roomPlayers = (rooms[0].players ?? []) as unknown as RoomPlayerFromJson[];

    const updated = roomPlayers.map(rp => {
      const gp = gamePlayers.find(p => p.userId === rp.userId);
      if (gp) {
        return {
          ...rp,
          stack: gp.stack,
          isFolded: false,
          betAmount: 0,
          isAllIn: false,
          isActive: gp.stack > 0,
        };
      }
      return rp;
    });

    await tx
      .update(pokerRooms)
      .set({
        status: 'waiting',
        currentGameId: null,
        players: updated as unknown as Record<string, unknown>[],
      })
      .where(eq(pokerRooms.id, roomId));
  }

  /**
   * 同步房间中玩家的 stack（游戏进行中）
   */
  private async syncRoomStack(
    tx: PostgresJsDatabase,
    roomId: string,
    gamePlayers: InternalGamePlayer[],
  ): Promise<void> {
    const rooms = await tx
      .select({ players: pokerRooms.players })
      .from(pokerRooms)
      .where(eq(pokerRooms.id, roomId))
      .limit(1);

    if (rooms.length === 0) return;

    const roomPlayers = (rooms[0].players ?? []) as unknown as RoomPlayerFromJson[];

    const updated = roomPlayers.map(rp => {
      const gp = gamePlayers.find(p => p.userId === rp.userId);
      if (gp) {
        return {
          ...rp,
          stack: gp.stack,
          isFolded: gp.isFolded,
          betAmount: gp.betAmount,
          isAllIn: gp.isAllIn,
        };
      }
      return rp;
    });

    await tx
      .update(pokerRooms)
      .set({ players: updated as unknown as Record<string, unknown>[] })
      .where(eq(pokerRooms.id, roomId));
  }

  /**
   * 脱敏返回：非本人且游戏未结束时不返回手牌
   */
  private sanitizeGameInfo(game: DbGame, userId: string): GameInfo {
    const showAll = game.status === 'finished';
    const sanitizedPlayers: GamePlayer[] = game.players.map(p => {
      const mine = p.userId === userId;
      return {
        userId: p.userId,
        seat: p.seat,
        holeCards: (mine || showAll) ? [...p.holeCards] : [],
        stack: p.stack,
        betAmount: p.betAmount,
        isFolded: p.isFolded,
        isAllIn: p.isAllIn,
        isActive: p.isActive,
      };
    });

    return {
      id: game.id,
      roomId: game.roomId,
      players: sanitizedPlayers,
      communityCards: [...game.communityCards],
      pot: game.pot,
      sidePots: [...game.sidePots],
      winnerIds: [...game.winnerIds],
      status: game.status as GameInfo['status'],
      currentBet: game.currentBet,
      currentPlayerSeat: game.currentPlayerSeat,
      dealerSeat: game.dealerSeat,
      smallBlindSeat: game.smallBlindSeat,
      bigBlindSeat: game.bigBlindSeat,
      round: game.round as GameInfo['round'],
      turnStartedAt: new Date(game.updatedAt).toISOString(),
      turnTimeoutSeconds: TURN_TIMEOUT_SECONDS,
      serverNow: new Date().toISOString(),
      startTime: game.startTime.toISOString(),
      endTime: game.endTime ? game.endTime.toISOString() : null,
    };
  }
}
