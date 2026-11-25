-- Poker Online confirmed Texas Hold'em rules: 2-9 players, 5% rake per pot, optional folded-card reveal.
ALTER TABLE poker_games
  ADD COLUMN IF NOT EXISTS rake_amount bigint NOT NULL DEFAULT 0;

-- Keep room capacity aligned with the confirmed 2-9 player rules.
ALTER TABLE poker_rooms
  DROP CONSTRAINT IF EXISTS poker_rooms_max_players_check;
ALTER TABLE poker_rooms
  ADD CONSTRAINT poker_rooms_max_players_check CHECK (max_players BETWEEN 2 AND 9);
