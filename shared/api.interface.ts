/* 前后端共享的类型写在这里 */

// 用户相关
export interface UserInfo {
  id: string;
  username: string;
  nickname: string;
  avatarUrl: string | null;
  coins: number;
  isAdmin: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface RegisterRequest {
  username: string;
  password: string;
  nickname: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface AuthResponse {
  token: string;
  user: UserInfo;
}

// 房间相关
export const ROOM_STATUSES = ['waiting', 'playing', 'finished'] as const;
export type RoomStatus = (typeof ROOM_STATUSES)[number];
export const ROOM_STATUS_LABELS: Record<RoomStatus, string> = {
  waiting: '等待中',
  playing: '游戏中',
  finished: '已结束',
};

export interface RoomPlayer {
  userId: string;
  nickname?: string;
  seat: number;
  stack: number;
  isActive: boolean;
  isFolded: boolean;
  betAmount: number;
  isAllIn: boolean;
}

export interface RoomInfo {
  id: string;
  roomCode: string;
  name: string;
  hostId: string;
  smallBlind: number;
  bigBlind: number;
  minBuyin: number;
  maxBuyin: number;
  maxPlayers: number;
  status: RoomStatus;
  isPrivate: boolean;
  currentGameId: string | null;
  players: RoomPlayer[];
  matchQueue: boolean;
  createdAt: string;
}

export interface CreateRoomRequest {
  name: string;
  smallBlind: number;
  bigBlind: number;
  minBuyin: number;
  maxBuyin: number;
  maxPlayers: number;
  isPrivate: boolean;
  buyinAmount: number;
}

export interface JoinRoomRequest {
  roomCode: string;
  buyinAmount: number;
}

// 游戏相关
export const GAME_ROUNDS = ['preflop', 'flop', 'turn', 'river', 'showdown'] as const;
export type GameRound = (typeof GAME_ROUNDS)[number];
export const GAME_ROUND_LABELS: Record<GameRound, string> = {
  preflop: '翻牌前',
  flop: '翻牌',
  turn: '转牌',
  river: '河牌',
  showdown: '摊牌',
};

export const GAME_STATUSES = ['waiting', 'preflop', 'flop', 'turn', 'river', 'showdown', 'finished'] as const;
export type GameStatus = (typeof GAME_STATUSES)[number];

export interface GamePlayer {
  userId: string;
  seat: number;
  holeCards: string[];
  stack: number;
  /** Current-street contribution; betAmount remains the hand-total contribution. */
  roundBet: number;
  betAmount: number;
  isFolded: boolean;
  isAllIn: boolean;
  isActive: boolean;
  showCardsAfterFold?: boolean;
}

export interface SidePot {
  amount: number;
  eligibleSeats: number[];
  rakeAmount?: number;
  netAmount?: number;
  winnerIds?: string[];
  payouts?: { userId: string; amount: number }[];
}

export interface GameInfo {
  id: string;
  roomId: string;
  players: GamePlayer[];
  communityCards: string[];
  pot: number;
  sidePots: SidePot[];
  winnerIds: string[];
  status: GameStatus;
  currentBet: number;
  currentPlayerSeat: number | null;
  dealerSeat: number;
  smallBlindSeat: number | null;
  bigBlindSeat: number | null;
  round: GameRound;
  turnStartedAt: string;
  turnTimeoutSeconds: number;
  serverNow: string;
  startTime: string;
  endTime: string | null;
}

export interface PlayerActionRequest {
  gameId: string;
  action: 'fold' | 'check' | 'call' | 'raise' | 'allin';
  amount?: number;
}

// 战绩
export interface GameRecord {
  id: string;
  gameId: string;
  userId: string;
  buyIn: number;
  finalStack: number;
  profit: number;
  holeCards: string[] | null;
  isWinner: boolean;
  createdAt: string;
}

// 充值记录
export interface RechargeRecord {
  id: string;
  adminId: string;
  userId: string;
  amount: number;
  remark: string | null;
  createdAt: string;
}

// 管理员
export interface AdminRechargeRequest {
  userId: string;
  amount: number;
  remark?: string;
}

export interface UserListResponse {
  items: UserInfo[];
  total: number;
  page: number;
  pageSize: number;
}

// 匹配队列
export interface MatchQueueInfo {
  waitingCount: number;
  matchedRoomId: string | null;
}

// 排行榜
export interface RankUser {
  userId: string;
  nickname: string;
  value: number;
  rank: number;
}

export interface RankListResponse {
  items: RankUser[];
}
