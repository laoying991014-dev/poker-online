/* eslint-disable */
// 独立部署版数据库 Schema：只依赖标准 PostgreSQL 类型，不再包含妙搭平台的 user_profile / file_attachment 自定义类型。
import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  customType,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

export const customTimestamptz = customType<{
  data: Date;
  driverData: string;
  config: { precision?: number };
}>({
  dataType(config) {
    const precision =
      typeof config?.precision !== 'undefined' ? ` (${config.precision})` : '';
    return `timestamptz${precision}`;
  },
  toDriver(value: Date | string | number) {
    if (value == null) return value as any;
    if (typeof value === 'number') return new Date(value).toISOString();
    if (typeof value === 'string') return value;
    if (value instanceof Date) return value.toISOString();
    throw new Error('Invalid timestamp value');
  },
  fromDriver(value: string | Date): Date {
    if (value instanceof Date) return value;
    return new Date(value);
  },
});

export const pokerUsers = pgTable(
  'poker_users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    username: varchar('username', { length: 50 }).notNull().unique(),
    passwordHash: varchar('password_hash', { length: 255 }).notNull(),
    nickname: varchar('nickname', { length: 100 }).notNull(),
    avatarUrl: varchar('avatar_url', { length: 500 }),
    coins: bigint('coins', { mode: 'number' }).notNull().default(0),
    isAdmin: boolean('is_admin').notNull().default(false),
    lastLoginAt: customTimestamptz('last_login_at', { precision: 6 }),
    createdAt: customTimestamptz('_created_at', { precision: 3 })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: customTimestamptz('_updated_at', { precision: 3 })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [uniqueIndex('poker_users_username_key').on(table.username)],
);

export const pokerRooms = pgTable(
  'poker_rooms',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    roomCode: varchar('room_code', { length: 10 }).notNull().unique(),
    name: varchar('name', { length: 100 }).notNull(),
    hostId: uuid('host_id').notNull(),
    smallBlind: bigint('small_blind', { mode: 'number' }).notNull().default(10),
    bigBlind: bigint('big_blind', { mode: 'number' }).notNull().default(20),
    minBuyin: bigint('min_buyin', { mode: 'number' }).notNull().default(200),
    maxBuyin: bigint('max_buyin', { mode: 'number' }).notNull().default(1000),
    maxPlayers: integer('max_players').notNull().default(9),
    status: varchar('status', { length: 20 }).notNull().default('waiting'),
    isPrivate: boolean('is_private').notNull().default(false),
    currentGameId: uuid('current_game_id'),
    /**
     * @type { userId: string, seat: number, stack: number, isActive: boolean, isFolded: boolean, betAmount: number, isAllIn: boolean }[]
     */
    players: jsonb('players').notNull().default('[]'),
    matchQueue: boolean('match_queue').notNull().default(false),
    createdAt: customTimestamptz('_created_at', { precision: 3 })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: customTimestamptz('_updated_at', { precision: 3 })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex('poker_rooms_room_code_key').on(table.roomCode),
    index('idx_poker_rooms_status').on(table.status),
    index('idx_poker_rooms_match_queue').on(table.matchQueue),
    foreignKey({
      columns: [table.hostId],
      foreignColumns: [pokerUsers.id],
      name: 'poker_rooms_host_id_fkey',
    }),
  ],
);

export const pokerGames = pgTable(
  'poker_games',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    roomId: uuid('room_id').notNull(),
    /**
     * @type { userId: string, seat: number, holeCards: string[], stack: number, betAmount: number, isFolded: boolean, isAllIn: boolean, isActive: boolean }[]
     */
    players: jsonb('players').notNull().default('[]'),
    /**
     * @type string[]
     */
    communityCards: jsonb('community_cards').notNull().default('[]'),
    pot: bigint('pot', { mode: 'number' }).notNull().default(0),
    /**
     * @type { amount: number, eligibleSeats: number[] }[]
     */
    sidePots: jsonb('side_pots').notNull().default('[]'),
    winnerIds: uuid('winner_ids').array().notNull().default([]),
    status: varchar('status', { length: 20 }).notNull().default('preflop'),
    currentBet: bigint('current_bet', { mode: 'number' }).notNull().default(0),
    currentPlayerSeat: integer('current_player_seat'),
    dealerSeat: integer('dealer_seat').notNull().default(0),
    smallBlindSeat: integer('small_blind_seat'),
    bigBlindSeat: integer('big_blind_seat'),
    round: varchar('round', { length: 20 }).notNull().default('preflop'),
    startTime: customTimestamptz('start_time', { precision: 6 })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    endTime: customTimestamptz('end_time', { precision: 6 }),
    createdAt: customTimestamptz('_created_at', { precision: 3 })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: customTimestamptz('_updated_at', { precision: 3 })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index('idx_poker_games_room_id').on(table.roomId),
    foreignKey({
      columns: [table.roomId],
      foreignColumns: [pokerRooms.id],
      name: 'poker_games_room_id_fkey',
    }),
  ],
);

export const pokerGamePlayers = pgTable(
  'poker_game_players',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    gameId: uuid('game_id').notNull(),
    userId: uuid('user_id').notNull(),
    buyIn: bigint('buy_in', { mode: 'number' }).notNull(),
    finalStack: bigint('final_stack', { mode: 'number' }).notNull(),
    profit: bigint('profit', { mode: 'number' }).notNull(),
    holeCards: varchar('hole_cards', { length: 10 }).array(),
    isWinner: boolean('is_winner').notNull().default(false),
    createdAt: customTimestamptz('_created_at', { precision: 3 })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: customTimestamptz('_updated_at', { precision: 3 })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index('idx_poker_game_players_user_id').on(table.userId),
    foreignKey({
      columns: [table.gameId],
      foreignColumns: [pokerGames.id],
      name: 'poker_game_players_game_id_fkey',
    }),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [pokerUsers.id],
      name: 'poker_game_players_user_id_fkey',
    }),
  ],
);

export const pokerRechargeRecords = pgTable(
  'poker_recharge_records',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    adminId: uuid('admin_id').notNull(),
    userId: uuid('user_id').notNull(),
    amount: bigint('amount', { mode: 'number' }).notNull(),
    remark: varchar('remark', { length: 500 }),
    createdAt: customTimestamptz('_created_at', { precision: 3 })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: customTimestamptz('_updated_at', { precision: 3 })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index('idx_poker_recharge_user_id').on(table.userId),
    foreignKey({
      columns: [table.adminId],
      foreignColumns: [pokerUsers.id],
      name: 'poker_recharge_records_admin_id_fkey',
    }),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [pokerUsers.id],
      name: 'poker_recharge_records_user_id_fkey',
    }),
  ],
);

// table aliases
export const pokerGamePlayersTable = pokerGamePlayers;
export const pokerGamesTable = pokerGames;
export const pokerRechargeRecordsTable = pokerRechargeRecords;
export const pokerRoomsTable = pokerRooms;
export const pokerUsersTable = pokerUsers;


// 管理后台扩展：俱乐部、成员、仅虚拟金币锦标赛、合规申请记录。
export const pokerClubs = pgTable(
  'poker_clubs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 100 }).notNull(),
    description: varchar('description', { length: 1000 }),
    ownerId: uuid('owner_id'),
    status: varchar('status', { length: 20 }).notNull().default('active'),
    createdAt: customTimestamptz('created_at', { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: customTimestamptz('updated_at', { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index('idx_poker_clubs_status').on(table.status)],
);

export const pokerClubMembers = pgTable(
  'poker_club_members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clubId: uuid('club_id').notNull(),
    userId: uuid('user_id').notNull(),
    role: varchar('role', { length: 20 }).notNull().default('member'),
    joinedAt: customTimestamptz('joined_at', { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex('poker_club_members_club_user_key').on(table.clubId, table.userId),
    index('idx_poker_club_members_user').on(table.userId),
    foreignKey({ columns: [table.clubId], foreignColumns: [pokerClubs.id], name: 'poker_club_members_club_id_fkey' }),
    foreignKey({ columns: [table.userId], foreignColumns: [pokerUsers.id], name: 'poker_club_members_user_id_fkey' }),
  ],
);

export const pokerTournaments = pgTable(
  'poker_tournaments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 120 }).notNull(),
    description: varchar('description', { length: 1000 }),
    entryFee: bigint('entry_fee', { mode: 'number' }).notNull().default(0),
    prizePool: bigint('prize_pool', { mode: 'number' }).notNull().default(0),
    maxPlayers: integer('max_players').notNull().default(100),
    startsAt: customTimestamptz('starts_at', { precision: 3 }),
    status: varchar('status', { length: 20 }).notNull().default('draft'),
    currencyType: varchar('currency_type', { length: 20 }).notNull().default('virtual_coins'),
    createdAt: customTimestamptz('created_at', { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: customTimestamptz('updated_at', { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index('idx_poker_tournaments_status').on(table.status)],
);

export const pokerComplianceRequests = pgTable(
  'poker_compliance_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id'),
    requestType: varchar('request_type', { length: 50 }).notNull().default('general'),
    amountLabel: varchar('amount_label', { length: 100 }),
    description: varchar('description', { length: 1000 }).notNull(),
    status: varchar('status', { length: 20 }).notNull().default('pending'),
    adminNote: varchar('admin_note', { length: 1000 }),
    reviewedBy: uuid('reviewed_by'),
    reviewedAt: customTimestamptz('reviewed_at', { precision: 3 }),
    createdAt: customTimestamptz('created_at', { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: customTimestamptz('updated_at', { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index('idx_poker_compliance_requests_status').on(table.status),
    index('idx_poker_compliance_requests_user').on(table.userId),
    foreignKey({ columns: [table.userId], foreignColumns: [pokerUsers.id], name: 'poker_compliance_requests_user_id_fkey' }),
    foreignKey({ columns: [table.reviewedBy], foreignColumns: [pokerUsers.id], name: 'poker_compliance_requests_reviewed_by_fkey' }),
  ],
);
