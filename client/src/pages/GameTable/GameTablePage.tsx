import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useEffect, useState, useCallback } from 'react';
import {
  ArrowLeft,
  LogOut,
  MessageSquare,
  Minus,
  Plus,
  RotateCw,
  Trophy,
  X,
} from 'lucide-react';

import { getRoom, leaveRoom, startGame } from '@client/src/api/rooms';
import { getGame, playerAction } from '@client/src/api/games';
import {
  getCachedUser,
  isLoggedIn,
  extractErrorMessage,
} from '@client/src/api/auth';

import type { RoomInfo, GameInfo, RoomPlayer } from '@shared/api.interface';

const BOT_USER_ID = '11111111-1111-4111-8111-111111111111';

const AVATARS = [
  '/avatars/player-1.jpg',
  '/avatars/player-2.jpg',
  '/avatars/player-3.jpg',
  '/avatars/player-4.jpg',
  '/avatars/player-5.jpg',
  '/avatars/player-6.jpg',
];

const SUIT_SYMBOL: Record<string, string> = {
  S: '♠',
  H: '♥',
  D: '♦',
  C: '♣',
};

const SUIT_COLOR: Record<string, string> = {
  S: '#111318',
  C: '#111318',
  H: '#d4202f',
  D: '#d4202f',
};

const ChipIcon: React.FC<{ className?: string }> = ({ className = '' }) => (
  <svg
    viewBox="0 0 24 24"
    className={className}
    aria-hidden="true"
    fill="none"
  >
    <circle cx="12" cy="12" r="9.5" fill="#101820" stroke="#e9f1f7" strokeWidth="1.7" />
    <circle cx="12" cy="12" r="5.6" stroke="#e9f1f7" strokeWidth="1.2" strokeDasharray="3 3" />
    <circle cx="12" cy="12" r="2.2" fill="#e9f1f7" opacity="0.8" />
  </svg>
);

const TableCard: React.FC<{
  card?: string;
  faceDown?: boolean;
  size?: 'community' | 'hole';
  compact?: boolean;
}> = ({ card, faceDown = false, size = 'community', compact = false }) => {
  const isCommunity = size === 'community';
  const box = isCommunity
    ? compact
      ? 'w-[clamp(28px,7.2svh,46px)] h-[clamp(39px,10svh,64px)] rounded-[5px]'
      : 'w-[clamp(46px,5.7vw,72px)] h-[clamp(64px,7.9vw,100px)] rounded-[7px]'
    : compact
      ? 'w-[clamp(18px,3.8svh,26px)] h-[clamp(25px,5.3svh,36px)] rounded-[3px]'
      : 'w-[clamp(25px,2.8vw,34px)] h-[clamp(35px,3.9vw,47px)] rounded-[4px]';

  if (faceDown || !card) {
    return (
      <div
        className={`${box} relative overflow-hidden border border-[#d9bd83]/60 bg-[#0b2118] shadow-[0_5px_14px_rgba(0,0,0,.6),inset_0_0_10px_rgba(0,0,0,.5)]`}
      >
        <div
          className="absolute inset-[3px] rounded-[3px] opacity-60"
          style={{
            backgroundImage:
              'repeating-linear-gradient(45deg,rgba(242,216,156,.22) 0 1px,transparent 1px 6px),repeating-linear-gradient(-45deg,rgba(242,216,156,.14) 0 1px,transparent 1px 6px)',
          }}
        />
        <div className="absolute inset-[4px] flex items-center justify-center border border-[#c7a468]/40">
          <span className="font-serif text-[#e7ce97]/65 text-[10px] tracking-[0.18em]">
            POKER
          </span>
        </div>
      </div>
    );
  }

  const rank = card[0];
  const suit = card[1];
  const color = SUIT_COLOR[suit] || '#111318';
  const symbol = SUIT_SYMBOL[suit] || suit;

  return (
    <div
      className={`${box} relative overflow-hidden border border-[#cfc3aa] bg-[#f6f1e6] shadow-[0_7px_18px_rgba(0,0,0,.6),inset_0_1px_0_rgba(255,255,255,.8)]`}
    >
      <div
        className="absolute inset-0 opacity-[0.97]"
        style={{
          background:
            'linear-gradient(145deg,#fffdf7 0%,#f4efe3 55%,#e7dfd1 100%)',
        }}
      />
      <span
        className={`absolute left-1.5 top-1 font-black leading-none ${
          isCommunity
            ? 'text-[clamp(13px,1.5vw,19px)]'
            : compact
              ? 'text-[8px]'
              : 'text-[10px]'
        }`}
        style={{ color }}
      >
        {rank}
      </span>
      <span
        className={`absolute left-1/2 top-[52%] -translate-x-1/2 -translate-y-1/2 leading-none ${
          isCommunity
            ? 'text-[clamp(24px,3.2vw,40px)]'
            : compact
              ? 'text-[11px]'
              : 'text-[15px]'
        }`}
        style={{ color }}
      >
        {symbol}
      </span>
      <span
        className={`absolute bottom-1 right-1.5 rotate-180 font-bold leading-none ${
          isCommunity ? 'text-[11px]' : compact ? 'text-[6px]' : 'text-[8px]'
        }`}
        style={{ color }}
      >
        {rank}
      </span>
    </div>
  );
};

function seatPoint(index: number, total: number, yRadius = 34) {
  const safeTotal = Math.max(1, total);
  const angle = (90 + (360 / safeTotal) * index) * (Math.PI / 180);
  return {
    x: 50 + Math.cos(angle) * 47,
    y: 50 + Math.sin(angle) * yRadius,
  };
}

const GameTablePage: React.FC = () => {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const currentUser = getCachedUser();

  const [room, setRoom] = useState<RoomInfo | null>(null);
  const [game, setGame] = useState<GameInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [raiseAmount, setRaiseAmount] = useState(0);
  const [actionLoading, setActionLoading] = useState(false);
  const [messages, setMessages] = useState<string[]>([]);
  const [compactLandscape, setCompactLandscape] = useState(false);
  const [rotateHint, setRotateHint] = useState(false);

  useEffect(() => {
    const syncLayout = () => {
      const isPortrait = window.innerHeight > window.innerWidth;
      const isTouch = window.matchMedia('(pointer: coarse)').matches;
      setCompactLandscape(
        window.matchMedia('(orientation: landscape) and (max-height: 620px)')
          .matches,
      );
      setRotateHint(isPortrait && isTouch && window.innerWidth < 900);
    };
    syncLayout();
    window.addEventListener('resize', syncLayout);
    window.addEventListener('orientationchange', syncLayout);
    return () => {
      window.removeEventListener('resize', syncLayout);
      window.removeEventListener('orientationchange', syncLayout);
    };
  }, []);

  const enterLandscape = useCallback(async () => {
    try {
      if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
      }
    } catch {
      // iOS Safari 不支持网页全屏，继续尝试方向锁定
    }
    try {
      const orientation = screen.orientation as unknown as {
        lock?: (type: string) => Promise<void>;
      };
      await orientation.lock?.('landscape');
    } catch {
      // 不支持方向锁定时由用户手动横屏
    }
  }, []);

  useEffect(() => {
    if (rotateHint) {
      void enterLandscape();
    }
  }, [enterLandscape, rotateHint]);

  useEffect(() => {
    if (!isLoggedIn()) {
      navigate(`/login?redirect=${encodeURIComponent(location.pathname)}`);
    }
  }, [navigate]);

  const fetchRoom = useCallback(async () => {
    if (!roomId) return;
    try {
      const roomData = await getRoom(roomId);
      setRoom(roomData);

      if (roomData.currentGameId && roomData.status === 'playing') {
        const gameData = await getGame(roomData.currentGameId);
        setGame(gameData);
      } else {
        setGame(null);
      }
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [roomId]);

  useEffect(() => {
    fetchRoom();
  }, [fetchRoom]);

  useEffect(() => {
    if (!roomId) return;
    const interval = setInterval(fetchRoom, 1500);
    return () => clearInterval(interval);
  }, [roomId, fetchRoom]);

  useEffect(() => {
    if (!room) return;
    setMessages([
      `已进入「${room.name}」`,
      `盲注 ${room.smallBlind} / ${room.bigBlind}`,
      `房间号 ${room.roomCode}`,
    ]);
  }, [room?.id]);

  const handleLeave = async () => {
    if (!roomId) return;
    try {
      await leaveRoom(roomId);
      navigate('/lobby');
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  };

  const handleStartGame = async () => {
    if (!roomId) return;
    try {
      const result = await startGame(roomId);
      const gameData = await getGame(result.gameId);
      setGame(gameData);
      setMessages((prev) => [...prev.slice(-2), '牌局开始，祝你好运']);
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  };

  const currentPlayerSeat = game?.currentPlayerSeat;
  const myPlayer = game?.players.find((p) => p.userId === currentUser?.id);
  const isMyTurn =
    currentPlayerSeat === myPlayer?.seat && game?.status !== 'finished';

  const maxRaise = myPlayer ? myPlayer.stack + myPlayer.betAmount : 0;
  const minRaise = game ? game.currentBet + (room?.bigBlind || 20) * 2 : 0;
  const raiseValue = Math.max(minRaise, Math.min(raiseAmount || minRaise, maxRaise));
  const callAmount = game
    ? Math.max(0, game.currentBet - (myPlayer?.betAmount || 0))
    : 0;
  const canRaise = maxRaise >= minRaise && myPlayer?.stack !== 0;

  useEffect(() => {
    if (!game || !myPlayer) return;
    const next = Math.max(minRaise, Math.min(maxRaise, minRaise));
    setRaiseAmount((prev) =>
      Math.max(minRaise, Math.min(maxRaise, prev > 0 ? prev : next)),
    );
  }, [game?.id, game?.currentBet, minRaise, maxRaise]);

  const handleAction = async (
    action: 'fold' | 'check' | 'call' | 'raise' | 'allin',
  ) => {
    if (!game) return;
    setActionLoading(true);
    try {
      const amount =
        action === 'raise'
          ? Math.max(minRaise, Math.min(raiseValue, maxRaise))
          : undefined;
      const gameData = await playerAction({ gameId: game.id, action, amount });
      setGame(gameData);
      const text: Record<string, string> = {
        fold: '你弃牌了',
        check: '你选择过牌',
        call: `你跟注 ${callAmount.toLocaleString()}`,
        raise: `你加注到 ${amount?.toLocaleString() || ''}`,
        allin: '你全下 ALL-IN',
      };
      setMessages((prev) => [...prev.slice(-3), text[action]]);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[100svh] bg-[radial-gradient(ellipse_at_50%_-10%,#0b2844_0%,#03101f_46%,#01050b_100%)] p-4">
        <div className="mx-auto max-w-[1180px] animate-pulse">
          <div className="mb-5 h-9 w-40 rounded bg-white/5" />
          <div className="aspect-[1.9/1] w-full rounded-[50%] border border-white/5 bg-white/[0.03]" />
          <div className="mt-6 h-14 w-full rounded bg-white/5" />
        </div>
      </div>
    );
  }

  if (error || !room) {
    return (
      <div className="flex min-h-[100svh] items-center justify-center bg-[#020912] px-4">
        <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#07131f] p-6 text-center shadow-2xl">
          <p className="mb-5 text-sm text-red-300">{error || '房间不存在'}</p>
          <button
            onClick={() => navigate('/lobby')}
            className="rounded-lg border border-white/15 px-4 py-2 text-sm text-white/80"
          >
            返回大厅
          </button>
        </div>
      </div>
    );
  }

  const isHost = room.hostId === currentUser?.id;
  const playerCount = room.players.length;
  const orderedPlayers = [...room.players].sort((a, b) => a.seat - b.seat);

  const seatLabel = (player: RoomPlayer) => {
    if (player.userId === BOT_USER_ID) return '电脑人·职业';
    if (player.nickname) return player.nickname.slice(0, 8);
    if (player.userId === currentUser?.id) return '我';
    return `玩家 ${player.seat + 1}`;
  };

  const currentActor = orderedPlayers.find(
    (p) => p.seat === game?.currentPlayerSeat,
  );
  const turnText =
    game?.status === 'finished'
      ? '本局结束'
      : isMyTurn
        ? '轮到你行动'
        : currentActor
          ? `等待 ${seatLabel(currentActor)} 行动`
          : '等待发牌';

  const winnerNames = (game?.winnerIds || []).map((id) => {
    const player = room.players.find((p) => p.userId === id);
    if (!player) return '未知';
    if (player.userId === currentUser?.id) return '你';
    return seatLabel(player);
  });

  return (
    <div
      className="relative flex h-[100svh] flex-col overflow-hidden text-white"
      style={{
        background:
          'radial-gradient(ellipse at 50% 8%, #452416 0%, #2a130c 26%, #140806 54%, #060202 100%)',
      }}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.22]"
        style={{
          backgroundImage:
            'repeating-linear-gradient(90deg,rgba(255,205,135,.08) 0 1px,transparent 1px 7px),repeating-linear-gradient(0deg,rgba(0,0,0,.25) 0 2px,transparent 2px 26px)',
        }}
      />
      <div className="pointer-events-none absolute inset-0 opacity-70">
        <div className="absolute left-1/2 top-0 h-[52%] w-[82%] -translate-x-1/2 bg-[radial-gradient(ellipse_at_top,rgba(255,186,92,.18),transparent_68%)] blur-2xl" />
        <div className="absolute inset-x-0 bottom-0 h-[42%] bg-gradient-to-t from-black/85 to-transparent" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_42%,rgba(0,0,0,.55)_100%)]" />
      </div>

      {rotateHint && (
        <div className="absolute inset-0 z-[70] flex flex-col items-center justify-center gap-3 bg-[radial-gradient(ellipse_at_center,#2a130c_0%,#140806_55%,#060202_100%)] px-6 text-center backdrop-blur-md">
          <div className="flex h-20 w-20 items-center justify-center rounded-full border border-[#c7a468]/45 bg-[#1a0d07]/85 shadow-[0_0_40px_rgba(199,164,104,.22)]">
            <RotateCw className="h-9 w-9 text-[#f0dca9]" />
          </div>
          <div className="font-serif text-lg font-bold tracking-[0.12em] text-[#f6e8c8]">
            请将手机横过来
          </div>
          <div className="max-w-[280px] text-xs leading-5 text-[#d8c7a8]/55">
            横屏后牌桌会自动放大，头像和手牌不再挡住牌桌
          </div>
          <button
            onClick={() => void enterLandscape()}
            className="mt-2 h-11 rounded-full border border-[#d8b478]/55 bg-gradient-to-b from-[#3a7a4e] to-[#153923] px-8 font-serif text-sm font-black tracking-[0.12em] text-[#f3e2b8] shadow-[0_6px_22px_rgba(0,0,0,.55),inset_0_1px_0_rgba(255,240,200,.2)] active:translate-y-px"
          >
            自动横屏进入
          </button>
          <div className="mt-1 flex items-center gap-4 text-[11px] text-[#d8c7a8]/40">
            <button onClick={() => setRotateHint(false)} className="underline-offset-4 hover:underline">
              继续竖屏
            </button>
            <button onClick={() => navigate('/lobby')} className="underline-offset-4 hover:underline">
              返回大厅
            </button>
          </div>
        </div>
      )}

      {/* 顶部信息 */}
      <header
        className={`relative z-50 flex shrink-0 items-center justify-between px-3 ${
          compactLandscape ? 'py-1' : 'pb-1 pt-2'
        } sm:px-5`}
      >
        <button
          onClick={() => navigate('/lobby')}
          className={`flex items-center justify-center rounded-full border border-[#b9975b]/55 bg-[radial-gradient(circle_at_35%_25%,#3b2518,#150a06_72%)] text-[#e4c88b] shadow-[0_3px_10px_rgba(0,0,0,.55),inset_0_1px_0_rgba(255,235,190,.18)] backdrop-blur transition hover:border-[#e0bf78] hover:text-[#ffe6b2] ${
            compactLandscape ? 'h-7 w-7' : 'h-9 w-9'
          }`}
          aria-label="返回大厅"
        >
          <ArrowLeft className={compactLandscape ? 'h-4 w-4' : 'h-5 w-5'} />
        </button>

        <div className="min-w-0 rounded-full border border-[#b9975b]/30 bg-[#180c07]/65 px-5 py-1 text-center shadow-[inset_0_1px_0_rgba(255,230,180,.1)] backdrop-blur">
          <div className="truncate font-serif text-[clamp(11px,1vw,14px)] font-semibold tracking-[0.14em] text-[#f1dfb4]">
            {room.name}
          </div>
          <div className="mt-0.5 text-[9px] tracking-[0.16em] text-[#d7b77a]/55">
            {room.roomCode} · {room.smallBlind}/{room.bigBlind}
          </div>
        </div>

        <button
          onClick={handleLeave}
          className={`flex items-center justify-center rounded-full border border-[#b9975b]/55 bg-[radial-gradient(circle_at_35%_25%,#3b2518,#150a06_72%)] text-[#e4c88b] shadow-[0_3px_10px_rgba(0,0,0,.55),inset_0_1px_0_rgba(255,235,190,.18)] backdrop-blur transition hover:border-red-400/70 hover:text-red-300 ${
            compactLandscape ? 'h-7 w-7' : 'h-9 w-9'
          }`}
          aria-label="离开房间"
        >
          <LogOut className={compactLandscape ? 'h-3.5 w-3.5' : 'h-4.5 w-4.5'} />
        </button>
      </header>

      {/* 牌桌 */}
      <main className="relative z-10 flex min-h-0 flex-1 items-center justify-center px-1 py-1">
        <div
          className={`relative ${
            compactLandscape
              ? 'aspect-[2.15/1]'
              : 'aspect-[1.5/1] sm:aspect-[1.95/1]'
          }`}
          style={{
            width: compactLandscape
              ? 'min(100%, calc((100svh - 142px) * 2.15))'
              : 'min(100%, calc((100svh - 154px) * 1.95))',
          }}
        >
          {/* 桌体 */}
          <div className="absolute inset-x-[4%] inset-y-[7%] rounded-[999px] border-2 border-[#a9804c]/45 bg-[linear-gradient(180deg,#6a3c22_0%,#462313_30%,#28120a_68%,#120704_100%)] p-[clamp(7px,1vw,13px)] shadow-[0_30px_90px_rgba(0,0,0,.8),inset_0_2px_2px_rgba(255,224,170,.18),inset_0_-4px_8px_rgba(0,0,0,.55)]">
            <div className="absolute inset-[3px] rounded-[999px] border border-[#e2c083]/20" />
            <div className="relative h-full w-full rounded-[999px] border border-[#d8b478]/45 bg-[#0c2116] p-[clamp(3px,0.45vw,6px)] shadow-[inset_0_0_18px_rgba(0,0,0,.75),0_1px_0_rgba(255,235,190,.18)]">
              <div
                className="relative h-full w-full overflow-hidden rounded-[999px] border border-[#0a2f20]/80"
                style={{
                  background:
                    'radial-gradient(ellipse at 50% 42%, #3b7b54 0%, #2a6544 34%, #1b4c33 62%, #0e3020 84%, #082116 100%)',
                  boxShadow:
                    'inset 0 0 70px rgba(0,0,0,.58), inset 0 0 30px rgba(255,220,150,.08), 0 0 0 1px rgba(255,239,198,.08)',
                }}
              >
                <div className="absolute inset-x-[7%] top-[8%] h-px bg-gradient-to-r from-transparent via-[#f4dca8]/20 to-transparent" />
                <div className="absolute inset-x-[10%] bottom-[10%] h-px bg-gradient-to-r from-transparent via-[#f4dca8]/12 to-transparent" />
                <div className="absolute inset-[6%] rounded-[999px] border border-[#f0d499]/[0.055]" />
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <span className="translate-y-[15%] font-serif text-[clamp(20px,3.9vw,52px)] font-black tracking-[0.44em] text-[#f2dfb0]/[0.055]">
                    POKER
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* 公共牌 */}
          <div
            className={`absolute left-1/2 z-20 flex -translate-x-1/2 -translate-y-1/2 items-center gap-[clamp(3px,0.45vw,6px)] ${
              compactLandscape ? 'top-[49%]' : 'top-[43%]'
            }`}
          >
            {(game?.communityCards?.length || 0) > 0 ? (
              game?.communityCards.map((card, i) => (
                <TableCard
                  key={i}
                  card={card}
                  size="community"
                  compact={compactLandscape}
                />
              ))
            ) : (
              <div className="rounded-full border border-[#d8b478]/25 bg-[#0b1a12]/55 px-4 py-1.5 text-[9px] tracking-[0.28em] text-[#e7ce97]/45">
                等待翻牌
              </div>
            )}
          </div>

          {/* 底池 */}
          <div
            className={`absolute left-1/2 z-20 -translate-x-1/2 ${
              compactLandscape ? 'top-[56%]' : 'top-[61%]'
            }`}
          >
            <div
              className={`flex items-center rounded-full border border-[#c7a468]/45 bg-[#160d08]/90 shadow-[0_8px_24px_rgba(0,0,0,.65),inset_0_1px_0_rgba(255,235,190,.16)] backdrop-blur ${
                compactLandscape
                  ? 'gap-1 px-2 py-0'
                  : 'gap-2 px-[clamp(10px,1.6vw,22px)] py-[clamp(3px,0.5vw,7px)]'
              }`}
            >
              <ChipIcon
                className={
                  compactLandscape
                    ? 'h-2.5 w-2.5'
                    : 'h-[clamp(14px,1.6vw,20px)] w-[clamp(14px,1.6vw,20px)]'
                }
              />
              <span
                className={`font-serif font-black tracking-wide text-[#f0dca9] ${
                  compactLandscape
                    ? 'text-[9px]'
                    : 'text-[clamp(13px,1.65vw,22px)]'
                }`}
              >
                POT $ {(game?.pot || 0).toLocaleString()}
              </span>
            </div>
            {(game?.sidePots?.length || 0) > 0 && (
              <div className="mt-1 text-center text-[9px] text-white/35">
                {game?.sidePots.length} 个边池
              </div>
            )}
          </div>

          {/* 座位 */}
          {orderedPlayers.map((player, index) => {
            const { x, y } = seatPoint(
              index,
              orderedPlayers.length,
              compactLandscape ? 30 : 34,
            );
            const gp = game?.players.find((p) => p.seat === player.seat);
            const isMe = player.userId === currentUser?.id;
            const folded = gp?.isFolded ?? player.isFolded;
            const allIn = gp?.isAllIn ?? player.isAllIn;
            const stack = gp?.stack ?? player.stack;
            const bet = gp?.betAmount ?? player.betAmount;
            const isTurn =
              game?.currentPlayerSeat === player.seat && game?.status !== 'finished';
            const isWinner = game?.winnerIds?.includes(player.userId);
            const avatar =
              player.userId === BOT_USER_ID
                ? AVATARS[4]
                : AVATARS[player.seat % AVATARS.length];

            const badges: string[] = [];
            if (game?.dealerSeat === player.seat) badges.push('D');
            if (game?.smallBlindSeat === player.seat) badges.push('S');
            if (game?.bigBlindSeat === player.seat) badges.push('B');

            const betX = isMe
              ? compactLandscape
                ? x - 10
                : x - 7
              : 50 + (x - 50) * 0.62;
            const betY = isMe
              ? compactLandscape
                ? y + 5
                : 74
              : y < 50
                ? 50 + (y - 50) * 0.55
                : 50 + (y - 50) * 0.7;
            const cardsOnLeft = x > 72;

            return (
              <React.Fragment key={player.seat}>
                {bet > 0 && !folded && game && (
                  <div
                    className="absolute z-20 -translate-x-1/2 -translate-y-1/2"
                    style={{ left: `${betX}%`, top: `${betY}%` }}
                  >
                    <div className="flex items-center gap-1.5 rounded-full border border-[#c7a468]/35 bg-[#140c07]/90 py-0.5 pl-1 pr-2.5 shadow-lg">
                      <ChipIcon className="h-4 w-4" />
                      <span className="text-[clamp(9px,1.1vw,13px)] font-bold text-[#f0dca9]/90">
                        $ {bet.toLocaleString()}
                      </span>
                    </div>
                  </div>
                )}

                <div
                  className="absolute z-30 -translate-x-1/2 -translate-y-1/2"
                  style={{
                    left: `${x}%`,
                    top: `${y + (compactLandscape && isMe ? 2 : 0)}%`,
                  }}
                >
                  <div
                    className={`relative flex flex-col items-center transition ${
                      folded ? 'opacity-45 saturate-50' : ''
                    }`}
                  >
                    <div className="relative flex items-start gap-1">
                      {badges.length > 0 && (
                        <div
                          className={`absolute z-20 flex flex-col gap-0.5 ${
                            compactLandscape ? 'left-1 top-1' : '-left-2 -top-2'
                          }`}
                        >
                          {badges.map((badge) => (
                            <span
                              key={badge}
                              className={`flex h-[clamp(15px,1.7vw,20px)] w-[clamp(15px,1.7vw,20px)] items-center justify-center rounded-full border text-[clamp(8px,0.9vw,10px)] font-black ${
                                badge === 'D'
                                  ? 'border-[#f3cf5b] bg-[#b58d22] text-[#111]'
                                  : 'border-white/40 bg-[#182632] text-white'
                              }`}
                            >
                              {badge}
                            </span>
                          ))}
                        </div>
                      )}

                      <div
                        className={`relative overflow-hidden rounded-[4px] bg-black shadow-[0_8px_22px_rgba(0,0,0,.7)] ${
                          isTurn
                            ? 'border-2 border-[#8be08d] shadow-[0_0_0_2px_rgba(86,210,115,.18),0_0_22px_rgba(121,227,139,.5)]'
                            : isWinner
                              ? 'border-2 border-[#f4cf5f]'
                              : 'border border-[#cfae75]/70'
                        }`}
                      >
                        <img
                          src={avatar}
                          alt=""
                          draggable={false}
                          className={
                            compactLandscape
                              ? 'h-[clamp(40px,11.4svh,62px)] w-[clamp(30px,8.4svh,48px)] object-cover object-center'
                              : 'h-[clamp(55px,7.8vw,104px)] w-[clamp(42px,5.8vw,78px)] object-cover object-center'
                          }
                        />
                        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/65 via-transparent to-transparent" />
                        {allIn && (
                          <div className="absolute inset-x-0 top-[42%] -translate-y-1/2 bg-[#b61d3c]/90 py-0.5 text-center text-[8px] font-black tracking-[0.16em] text-white">
                            ALL IN
                          </div>
                        )}
                      </div>

                      {game && gp && !folded && (
                        <div
                          className={`absolute top-0 flex items-start ${
                            cardsOnLeft
                              ? compactLandscape
                                ? '-left-[clamp(34px,7.5svh,66px)] flex-row-reverse'
                                : '-left-[clamp(56px,6vw,76px)] flex-row-reverse'
                              : compactLandscape
                                ? '-right-[clamp(34px,7.5svh,66px)]'
                                : '-right-[clamp(56px,6vw,76px)]'
                          }`}
                        >
                          {[0, 1].map((i) => {
                            const canSee =
                              isMe ||
                              game.status === 'showdown' ||
                              game.status === 'finished';
                            const holeCard = gp.holeCards?.[i];
                            return (
                              <div
                                key={i}
                                className={i === 0 ? '-rotate-6' : 'ml-[-9px] mt-1 rotate-6'}
                              >
                                <TableCard
                                  card={canSee ? holeCard : undefined}
                                  faceDown={!canSee || !holeCard}
                                  size="hole"
                                  compact={compactLandscape}
                                />
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    <div
                      className={`relative mt-0.5 ${
                        compactLandscape
                          ? 'w-[clamp(58px,11svh,92px)]'
                          : 'w-[clamp(82px,10.2vw,134px)]'
                      }`}
                    >
                      <div
                        className={`relative overflow-hidden rounded-[7px] border-2 px-1.5 pb-1 pt-[3px] text-center shadow-[0_6px_14px_rgba(0,0,0,.55),inset_0_1px_0_rgba(255,235,190,.12)] ${
                          isTurn && !folded
                            ? 'border-[#8be08d]'
                            : isMe
                              ? 'border-[#cfa96a]'
                              : folded
                                ? 'border-[#6d5b45]/70'
                                : 'border-[#b9975b]/80'
                        }`}
                        style={{
                          background:
                            isTurn && !folded
                              ? 'linear-gradient(180deg,#2f6a42 0%,#153923 58%,#0b2215 100%)'
                              : isMe
                                ? 'linear-gradient(180deg,#5a1f26 0%,#341016 60%,#1d090c 100%)'
                                : 'linear-gradient(180deg,#3a2419 0%,#24130d 58%,#120906 100%)',
                        }}
                      >
                        <div className="truncate font-serif text-[clamp(9px,1vw,13px)] font-semibold tracking-[0.04em] text-[#f4e3bd]">
                          {seatLabel(player)}
                          {player.userId === BOT_USER_ID && (
                            <span className="ml-1 text-[7px] tracking-[0.12em] text-[#9ecfa7]">
                              BOT
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 flex items-center justify-center gap-1 border-t border-[#d8b478]/20 pt-0.5">
                          <ChipIcon className="h-2.5 w-2.5" />
                          <span className="text-[clamp(8px,1.05vw,12px)] font-bold tracking-wide text-[#f2d377]">
                            $ {stack.toLocaleString()}
                          </span>
                        </div>
                      </div>
                      {(folded || (isTurn && !folded)) && (
                        <div
                          className={`absolute -top-5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border px-2 py-0.5 font-serif text-[8px] font-black uppercase tracking-[0.12em] backdrop-blur ${
                            folded
                              ? 'border-white/15 bg-black/70 text-white/45'
                              : 'border-[#8be08d]/45 bg-[#102b1a]/90 text-[#a8eab2]'
                          }`}
                        >
                          {folded ? 'FOLD' : 'TURN'}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </React.Fragment>
            );
          })}

          {/* 等待开局 */}
          {room.status === 'waiting' && (
            <div className="absolute left-1/2 top-[50%] z-40 w-[min(86%,340px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-white/15 bg-[#040b12]/85 p-4 text-center shadow-[0_24px_70px_rgba(0,0,0,.8)] backdrop-blur-md">
              <div className="text-[10px] font-semibold tracking-[0.35em] text-[#70c8ff]/80">
                WAITING
              </div>
              <div className="mt-2 text-lg font-bold">等待玩家加入</div>
              <div className="mt-1 text-xs text-white/50">
                {playerCount} / {room.maxPlayers} 人 · 盲注 {room.smallBlind}/{room.bigBlind}
              </div>
              <div className="mt-3 text-[11px] text-white/35">
                邀请好友输入房间号
                <span className="ml-1 rounded bg-white/10 px-1.5 py-0.5 font-mono text-white/70">
                  {room.roomCode}
                </span>
              </div>
              {isHost && playerCount >= 2 && (
                <button
                  onClick={handleStartGame}
                  className="mt-4 rounded-[4px] border border-[#9f853a] bg-gradient-to-b from-[#d9b95c] to-[#8e6d20] px-8 py-2 text-xs font-black tracking-[0.2em] text-[#111] shadow-[0_6px_18px_rgba(0,0,0,.45)]"
                >
                  开始牌局
                </button>
              )}
            </div>
          )}

          {/* 结算 */}
          {game && game.status === 'finished' && (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/45 px-4 backdrop-blur-[2px]">
              <div className="w-full max-w-[360px] rounded-2xl border border-[#f4cf5f]/30 bg-[#050b12]/95 p-5 text-center shadow-[0_30px_90px_rgba(0,0,0,.85)]">
                <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full border border-[#f4cf5f]/40 bg-[#f4cf5f]/10">
                  <Trophy className="h-5 w-5 text-[#f4cf5f]" />
                </div>
                <div className="mt-3 text-[10px] font-semibold tracking-[0.32em] text-white/40">
                  HAND COMPLETE
                </div>
                <div className="mt-1 text-xl font-bold">本局结束</div>
                <div className="mt-3 text-sm text-white/55">赢家</div>
                <div className="mt-1 text-base font-semibold text-[#f4cf5f]">
                  {winnerNames.length > 0 ? winnerNames.join(' · ') : '无'}
                </div>
                <div className="mt-2 text-xs text-white/35">
                  底池 $ {(game.pot || 0).toLocaleString()}
                </div>
                <div className="mt-5 flex justify-center gap-2">
                  <button
                    onClick={fetchRoom}
                    className="rounded-[4px] border border-[#9f853a] bg-gradient-to-b from-[#d9b95c] to-[#8e6d20] px-5 py-2 text-xs font-black text-[#111]"
                  >
                    等待下一局
                  </button>
                  <button
                    onClick={handleLeave}
                    className="rounded-[4px] border border-white/15 bg-white/5 px-5 py-2 text-xs text-white/60"
                  >
                    离开牌桌
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* 底部操作区 */}
      {game?.status !== 'finished' && (
        <footer
          className={`relative z-40 shrink-0 px-2 ${
            compactLandscape ? 'pb-1 pt-0' : 'pb-2 pt-1'
          } sm:px-5 sm:pb-4`}
        >
          <div className="mx-auto flex w-full max-w-[1440px] items-end gap-3">
            {/* 牌桌动态 */}
            <div
              className={`w-[240px] shrink-0 overflow-hidden rounded-md border border-[#a98955]/40 bg-[#140d08]/90 shadow-[inset_0_1px_0_rgba(255,235,190,.08)] backdrop-blur ${
                compactLandscape ? 'hidden' : 'hidden md:block'
              }`}
            >
              <div className="flex items-center gap-2 border-b border-[#a98955]/25 px-3 py-1.5">
                <MessageSquare className="h-3.5 w-3.5 text-[#d8b478]" />
                <span className="font-serif text-[9px] font-semibold tracking-[0.24em] text-[#e7ce97]/65">
                  TABLE CHAT
                </span>
              </div>
              <div className="h-[96px] space-y-1 overflow-hidden px-3 py-2">
                {messages.slice(-4).map((message, index) => (
                  <div
                    key={`${message}-${index}`}
                    className="truncate text-[10px] leading-4 text-white/38"
                  >
                    <span className="mr-1 text-[#6c95ae]">›</span>
                    {message}
                  </div>
                ))}
                <div className="truncate text-[10px] font-medium leading-4 text-[#f2d377]/80">
                  <span className="mr-1 text-[#f2d377]">●</span>
                  {turnText}
                </div>
              </div>
            </div>

            <div className="min-w-0 flex-1">
              {/* 加注控制 */}
              {isMyTurn && myPlayer && !myPlayer.isFolded && (
                <div
                  className={`flex items-center justify-center gap-1.5 rounded-md border border-[#a98955]/35 bg-[#140d08]/90 px-2 backdrop-blur sm:justify-end sm:px-3 ${
                    compactLandscape ? 'mb-1 py-1' : 'mb-1.5 py-1.5'
                  }`}
                >
                  <span className="hidden font-serif text-[9px] font-semibold tracking-[0.18em] text-[#e7ce97]/50 sm:inline">
                    RAISE TO
                  </span>
                  <button
                    onClick={() =>
                      setRaiseAmount(
                        Math.max(minRaise, raiseValue - (room?.bigBlind || 20)),
                      )
                    }
                    disabled={actionLoading}
                    className="flex h-7 w-7 items-center justify-center rounded border border-white/15 bg-white/5 text-white/70 disabled:opacity-30"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <input
                    type="number"
                    value={raiseValue}
                    min={minRaise}
                    max={maxRaise}
                    onChange={(e) => setRaiseAmount(Number(e.target.value))}
                    className="h-7 w-[78px] rounded border border-white/15 bg-black/50 text-center text-sm font-bold text-white outline-none focus:border-[#ff2d6f]/60"
                  />
                  <button
                    onClick={() =>
                      setRaiseAmount(
                        Math.min(maxRaise, raiseValue + (room?.bigBlind || 20)),
                      )
                    }
                    disabled={actionLoading}
                    className="flex h-7 w-7 items-center justify-center rounded border border-white/15 bg-white/5 text-white/70 disabled:opacity-30"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => handleAction('allin')}
                    disabled={actionLoading}
                    className="ml-1 h-7 rounded border border-[#f3cf5b]/35 bg-[#f3cf5b]/10 px-2.5 text-[9px] font-black tracking-[0.12em] text-[#f3cf5b] disabled:opacity-30"
                  >
                    ALL IN
                  </button>
                </div>
              )}

              {/* 主操作按钮 */}
              <div
                className={`grid grid-cols-3 rounded-md border border-white/10 bg-black/35 shadow-[0_12px_35px_rgba(0,0,0,.55)] backdrop-blur ${
                  compactLandscape ? 'gap-1.5 p-1' : 'gap-1.5 p-1.5 sm:gap-2.5 sm:p-2.5'
                } border-[#a98955]/35 bg-[#1a0f09]/85`}
              >
                <button
                  onClick={() => handleAction('fold')}
                  disabled={!isMyTurn || actionLoading}
                  className={`group relative ${
                    compactLandscape
                      ? 'h-10 text-[11px]'
                      : 'h-[clamp(44px,5.1vw,58px)] text-[clamp(10px,1.2vw,13px)]'
                  } overflow-hidden rounded-[5px] border border-[#a98955]/60 bg-gradient-to-b from-[#5b5136] via-[#37301f] to-[#19150c] font-serif font-black tracking-[0.12em] text-[#f1e2bb] shadow-[0_5px_0_#0c0a05,0_9px_20px_rgba(0,0,0,.5),inset_0_1px_0_rgba(255,238,196,.2)] transition active:translate-y-[2px] active:shadow-[0_3px_0_#0c0a05] disabled:cursor-not-allowed disabled:opacity-60`}
                >
                  <span className="absolute inset-x-1 top-0 h-px bg-white/25" />
                  FOLD / 弃牌
                </button>

                <button
                  onClick={() => handleAction(callAmount === 0 ? 'check' : 'call')}
                  disabled={!isMyTurn || actionLoading || !myPlayer}
                  className={`group relative ${
                    compactLandscape
                      ? 'h-10 text-[11px]'
                      : 'h-[clamp(44px,5.1vw,58px)] text-[clamp(10px,1.2vw,13px)]'
                  } overflow-hidden rounded-[5px] border border-[#6fa77c]/70 bg-gradient-to-b from-[#2f7049] via-[#1c4b2f] to-[#0c2a1a] font-serif font-black tracking-[0.08em] text-[#f1f6e8] shadow-[0_5px_0_#07160d,0_9px_20px_rgba(0,0,0,.5),inset_0_1px_0_rgba(255,255,255,.22)] transition active:translate-y-[2px] active:shadow-[0_3px_0_#07160d] disabled:cursor-not-allowed disabled:opacity-60`}
                >
                  <span className="absolute inset-x-1 top-0 h-px bg-white/25" />
                  {callAmount === 0
                    ? 'CHECK / 过牌'
                    : `CALL $${callAmount.toLocaleString()}`}
                </button>

                <button
                  onClick={() => handleAction('raise')}
                  disabled={!isMyTurn || actionLoading || !canRaise}
                  className={`group relative ${
                    compactLandscape
                      ? 'h-10 text-[11px]'
                      : 'h-[clamp(44px,5.1vw,58px)] text-[clamp(10px,1.2vw,13px)]'
                  } overflow-hidden rounded-[5px] border border-[#c08a5a]/75 bg-gradient-to-b from-[#8a2630] via-[#5d151d] to-[#2e090d] font-serif font-black tracking-[0.12em] text-[#f8e6cd] shadow-[0_5px_0_#180305,0_9px_20px_rgba(0,0,0,.5),inset_0_1px_0_rgba(255,235,190,.22)] transition active:translate-y-[2px] active:shadow-[0_3px_0_#180305] disabled:cursor-not-allowed disabled:opacity-60`}
                >
                  <span className="absolute inset-x-1 top-0 h-px bg-white/25" />
                  RAISE / 加注
                </button>
              </div>
            </div>
          </div>
        </footer>
      )}

      {error && (
        <div className="absolute left-1/2 top-16 z-[60] flex -translate-x-1/2 items-center gap-2 rounded-lg border border-red-400/30 bg-[#260a10]/95 px-3 py-2 text-xs text-red-200 shadow-xl">
          <X className="h-3.5 w-3.5" />
          {error}
        </div>
      )}
    </div>
  );
};

export default GameTablePage;
