-- 德州扑克在线 · Supabase 建表脚本
-- 在 Supabase Dashboard → SQL Editor 中整段执行一次即可。

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 用户表
CREATE TABLE IF NOT EXISTS poker_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username varchar(50) NOT NULL,
  password_hash varchar(255) NOT NULL,
  nickname varchar(100) NOT NULL,
  avatar_url varchar(500),
  coins bigint NOT NULL DEFAULT 0,
  is_admin boolean NOT NULL DEFAULT false,
  last_login_at timestamptz(6),
  _created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS poker_users_username_key
  ON poker_users (username);

-- 房间表
CREATE TABLE IF NOT EXISTS poker_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_code varchar(10) NOT NULL,
  name varchar(100) NOT NULL,
  host_id uuid NOT NULL,
  small_blind bigint NOT NULL DEFAULT 10,
  big_blind bigint NOT NULL DEFAULT 20,
  min_buyin bigint NOT NULL DEFAULT 200,
  max_buyin bigint NOT NULL DEFAULT 1000,
  max_players integer NOT NULL DEFAULT 9,
  status varchar(20) NOT NULL DEFAULT 'waiting',
  is_private boolean NOT NULL DEFAULT false,
  current_game_id uuid,
  players jsonb NOT NULL DEFAULT '[]'::jsonb,
  match_queue boolean NOT NULL DEFAULT false,
  _created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT poker_rooms_room_code_key UNIQUE (room_code),
  CONSTRAINT poker_rooms_host_id_fkey
    FOREIGN KEY (host_id) REFERENCES poker_users (id)
);
CREATE INDEX IF NOT EXISTS idx_poker_rooms_status ON poker_rooms (status);
CREATE INDEX IF NOT EXISTS idx_poker_rooms_match_queue ON poker_rooms (match_queue);

-- 对局表
CREATE TABLE IF NOT EXISTS poker_games (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL,
  players jsonb NOT NULL DEFAULT '[]'::jsonb,
  community_cards jsonb NOT NULL DEFAULT '[]'::jsonb,
  pot bigint NOT NULL DEFAULT 0,
  side_pots jsonb NOT NULL DEFAULT '[]'::jsonb,
  winner_ids uuid[] NOT NULL DEFAULT '{}',
  status varchar(20) NOT NULL DEFAULT 'preflop',
  current_bet bigint NOT NULL DEFAULT 0,
  current_player_seat integer,
  dealer_seat integer NOT NULL DEFAULT 0,
  small_blind_seat integer,
  big_blind_seat integer,
  round varchar(20) NOT NULL DEFAULT 'preflop',
  start_time timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  end_time timestamptz(6),
  _created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT poker_games_room_id_fkey
    FOREIGN KEY (room_id) REFERENCES poker_rooms (id)
);
CREATE INDEX IF NOT EXISTS idx_poker_games_room_id ON poker_games (room_id);

-- 对局玩家表
CREATE TABLE IF NOT EXISTS poker_game_players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL,
  user_id uuid NOT NULL,
  buy_in bigint NOT NULL,
  final_stack bigint NOT NULL,
  profit bigint NOT NULL,
  hole_cards varchar(10)[],
  is_winner boolean NOT NULL DEFAULT false,
  _created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT poker_game_players_game_id_fkey
    FOREIGN KEY (game_id) REFERENCES poker_games (id),
  CONSTRAINT poker_game_players_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES poker_users (id)
);
CREATE INDEX IF NOT EXISTS idx_poker_game_players_user_id
  ON poker_game_players (user_id);

-- 充值记录表
CREATE TABLE IF NOT EXISTS poker_recharge_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL,
  user_id uuid NOT NULL,
  amount bigint NOT NULL,
  remark varchar(500),
  _created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT poker_recharge_records_admin_id_fkey
    FOREIGN KEY (admin_id) REFERENCES poker_users (id),
  CONSTRAINT poker_recharge_records_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES poker_users (id)
);
CREATE INDEX IF NOT EXISTS idx_poker_recharge_user_id
  ON poker_recharge_records (user_id);
