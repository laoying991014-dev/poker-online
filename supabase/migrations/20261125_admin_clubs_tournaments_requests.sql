-- Poker Online 管理后台扩展
-- 仅新增俱乐部、俱乐部成员、虚拟金币锦标赛、合规业务申请记录表。
-- 不涉及真钱收付，不连接 KBZPay / USDT，不提供扑克赢款兑现。

CREATE TABLE IF NOT EXISTS poker_clubs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(100) NOT NULL,
  description varchar(1000),
  owner_id uuid REFERENCES poker_users(id) ON DELETE SET NULL,
  status varchar(20) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'disabled')),
  created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_poker_clubs_status ON poker_clubs(status);

CREATE TABLE IF NOT EXISTS poker_club_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES poker_clubs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES poker_users(id) ON DELETE CASCADE,
  role varchar(20) NOT NULL DEFAULT 'member'
    CHECK (role IN ('owner', 'admin', 'member')),
  joined_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT poker_club_members_club_user_key UNIQUE (club_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_poker_club_members_user ON poker_club_members(user_id);

CREATE TABLE IF NOT EXISTS poker_tournaments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(120) NOT NULL,
  description varchar(1000),
  entry_fee bigint NOT NULL DEFAULT 0 CHECK (entry_fee >= 0),
  prize_pool bigint NOT NULL DEFAULT 0 CHECK (prize_pool >= 0),
  max_players integer NOT NULL DEFAULT 100 CHECK (max_players BETWEEN 2 AND 10000),
  starts_at timestamptz(3),
  status varchar(20) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'scheduled', 'running', 'finished', 'cancelled')),
  currency_type varchar(20) NOT NULL DEFAULT 'virtual_coins'
    CHECK (currency_type = 'virtual_coins'),
  created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_poker_tournaments_status ON poker_tournaments(status);

CREATE TABLE IF NOT EXISTS poker_compliance_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES poker_users(id) ON DELETE SET NULL,
  request_type varchar(50) NOT NULL DEFAULT 'general',
  amount_label varchar(100),
  description varchar(1000) NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'closed')),
  admin_note varchar(1000),
  reviewed_by uuid REFERENCES poker_users(id) ON DELETE SET NULL,
  reviewed_at timestamptz(3),
  created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_poker_compliance_requests_status
  ON poker_compliance_requests(status);
CREATE INDEX IF NOT EXISTS idx_poker_compliance_requests_user
  ON poker_compliance_requests(user_id);

ALTER TABLE poker_clubs ENABLE ROW LEVEL SECURITY;
ALTER TABLE poker_club_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE poker_tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE poker_compliance_requests ENABLE ROW LEVEL SECURITY;
