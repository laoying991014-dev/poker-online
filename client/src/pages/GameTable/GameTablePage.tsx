import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useEffect, useState, useCallback, useRef } from 'react';
import {
  ArrowLeft,
  Clock,
  LogOut,
  MessageSquare,
  Minus,
  Plus,
  Settings2,
  Trophy,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';

import { getRoom, leaveRoom, startGame } from '@client/src/api/rooms';
import { getGame, playerAction } from '@client/src/api/games';
import {
  getCachedUser,
  isLoggedIn,
  extractErrorMessage,
} from '@client/src/api/auth';
import { useGameSounds } from './useGameSounds';
import './GameTableTheme.css';

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

const DEFAULT_PREFLOP_MULTIPLIERS = [2, 2.5, 3, 4];
const DEFAULT_POSTFLOP_POT_PERCENTAGES = [33, 50, 75, 100];
type RaiseStepMode = 'fine' | 'normal' | 'fast';

function readNumberPreferences(
  key: string,
  defaults: number[],
  min: number,
  max: number,
): number[] {
  try {
    const stored = window.localStorage.getItem(key);
    if (!stored) return [...defaults];
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed) || parsed.length !== defaults.length) {
      return [...defaults];
    }
    return parsed.map((value, index) => {
      const number = Number(value);
      return Number.isFinite(number)
        ? Math.min(max, Math.max(min, number))
        : defaults[index];
    });
  } catch {
    return [...defaults];
  }
}

function readRaiseStepMode(): RaiseStepMode {
  try {
    const stored = window.localStorage.getItem('poker-raise-step-mode');
    return stored === 'fine' || stored === 'fast' ? stored : 'normal';
  } catch {
    return 'normal';
  }
}

const FOUR_COLOR_SUIT_COLOR: Record<string, string> = {
  S: '#2563eb',
  H: '#dc2626',
  D: '#d97706',
  C: '#16a34a',
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
  size?: 'community' | 'hole' | 'mini' | 'peek';
  compact?: boolean;
  fourColorDeck?: boolean;
}> = ({ card, faceDown = false, size = 'community', compact = false, fourColorDeck = false }) => {
  const isCommunity = size === 'community';
  const isPeek = size === 'peek';
  const isMini = size === 'mini';
  const box = isCommunity
    ? compact
      ? 'w-[clamp(34px,8.8svh,52px)] h-[clamp(47px,12.2svh,72px)] rounded-[5px]'
      : 'w-[clamp(46px,7.2vw,96px)] h-[clamp(64px,10vw,134px)] rounded-[7px]'
    : isPeek
      ? 'w-[clamp(84px,23vw,122px)] h-[clamp(118px,32vw,171px)] rounded-[8px]'
      : isMini
        ? compact
          ? 'w-[clamp(15px,3.2svh,21px)] h-[clamp(21px,4.5svh,30px)] rounded-[2px]'
          : 'w-[clamp(18px,1.9vw,23px)] h-[clamp(25px,2.6vw,32px)] rounded-[3px]'
        : compact
          ? 'w-[clamp(22px,4.4svh,28px)] h-[clamp(31px,6svh,40px)] rounded-[3px]'
          : 'w-[clamp(25px,2.8vw,34px)] h-[clamp(35px,3.9vw,47px)] rounded-[4px]';

  if (faceDown || !card) {
    return (
      <div
        className={`${box} relative overflow-hidden border border-[#c7a468]/55 bg-[#1a2a40] shadow-[0_5px_14px_rgba(0,0,0,.6),inset_0_0_10px_rgba(0,0,0,.5)]`}
      >
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse at 50% 42%,#2c4462 0%,#1b3049 48%,#0d1a2b 100%)',
          }}
        />
        <div
          className="absolute inset-[2px] rounded-[4px] border border-[#e8cf95]/45 opacity-80"
          style={{
            backgroundImage:
              'repeating-linear-gradient(45deg,rgba(238,214,160,.14) 0 1px,transparent 1px 5px),repeating-linear-gradient(-45deg,rgba(238,214,160,.1) 0 1px,transparent 1px 5px)',
          }}
        />
        <div className="absolute inset-[4px] flex items-center justify-center rounded-[3px] border border-[#e2c487]/35">
          <span
            className={`font-serif leading-none tracking-[0.2em] text-[#f1dca8]/70 ${
              isPeek ? 'text-[15px]' : isCommunity ? 'text-[10px]' : 'text-[6px]'
            }`}
          >
            ✦
          </span>
        </div>
      </div>
    );
  }

  const rank = card[0];
  const suit = card[1];
  const color = fourColorDeck
    ? (FOUR_COLOR_SUIT_COLOR[suit] || '#111318')
    : (SUIT_COLOR[suit] || '#111318');
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
            ? 'text-[clamp(13px,1.7vw,23px)]'
            : isPeek
              ? 'text-[clamp(18px,4.6vw,26px)]'
              : isMini
                ? 'text-[8px]'
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
            ? compact
              ? 'text-[clamp(18px,4.4svh,27px)]'
              : 'text-[clamp(24px,3.8vw,52px)]'
            : isPeek
              ? 'text-[clamp(32px,8vw,48px)]'
              : isMini
                ? 'text-[10px]'
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
          isCommunity
            ? 'text-[11px]'
            : isPeek
              ? 'text-[clamp(12px,3vw,17px)]'
              : isMini
                ? 'text-[6px]'
                : compact
                  ? 'text-[6px]'
                  : 'text-[8px]'
        }`}
        style={{ color }}
      >
        {rank}
      </span>
    </div>
  );
};

function seatPoint(
  index: number,
  total: number,
  yRadius = 34,
  xRadius = 43,
) {
  const safeTotal = Math.max(1, total);
  const angle = (90 + (360 / safeTotal) * index) * (Math.PI / 180);
  return {
    x: 50 + Math.cos(angle) * xRadius,
    y: 50 + Math.sin(angle) * yRadius,
  };
}

function speakChinese(text: string) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  try {
    const synth = window.speechSynthesis;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'zh-CN';
    utterance.rate = 0.95;
    utterance.pitch = 1;
    utterance.volume = 0.9;
    const zhVoice = synth
      .getVoices()
      .find(voice => voice.lang.toLowerCase().startsWith('zh'));
    if (zhVoice) utterance.voice = zhVoice;
    synth.cancel();
    synth.speak(utterance);
  } catch {
    // 浏览器不支持中文语音时静默降级，不影响操作。
  }
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
  const [tableMenuOpen, setTableMenuOpen] = useState(false);
  const [fourColorDeck, setFourColorDeck] = useState(() => {
    try {
      return window.localStorage.getItem('poker-four-color-deck') === 'true';
    } catch {
      return false;
    }
  });
  const [preflopMultipliers, setPreflopMultipliers] = useState<number[]>(() =>
    readNumberPreferences('poker-preflop-multipliers', DEFAULT_PREFLOP_MULTIPLIERS, 1.1, 20),
  );
  const [preflopMultiplierInputs, setPreflopMultiplierInputs] = useState<string[]>(() =>
    readNumberPreferences('poker-preflop-multipliers', DEFAULT_PREFLOP_MULTIPLIERS, 1.1, 20).map(String),
  );
  const [postflopPotPercentages, setPostflopPotPercentages] = useState<number[]>(() =>
    readNumberPreferences('poker-postflop-pot-percentages', DEFAULT_POSTFLOP_POT_PERCENTAGES, 10, 200),
  );
  const [postflopPercentageInputs, setPostflopPercentageInputs] = useState<string[]>(() =>
    readNumberPreferences('poker-postflop-pot-percentages', DEFAULT_POSTFLOP_POT_PERCENTAGES, 10, 200).map(String),
  );
  const [raiseStepMode, setRaiseStepMode] = useState<RaiseStepMode>(readRaiseStepMode);
  const [compactLandscape, setCompactLandscape] = useState(false);
  const [portraitMobile, setPortraitMobile] = useState(false);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const { enabled: soundEnabled, toggle: toggleSound, play: playSound } =
    useGameSounds();
  const previousGameRef = useRef<GameInfo | null>(null);
  const lastGameRef = useRef<GameInfo | null>(null);
  const suppressPotSoundRef = useRef(false);
  const autoActedKeyRef = useRef<string | null>(null);
  const lastTurnKeyRef = useRef<string | null>(null);
  const serverOffsetRef = useRef(0);

  useEffect(() => {
    try {
      window.localStorage.setItem('poker-four-color-deck', String(fourColorDeck));
      window.localStorage.setItem('poker-preflop-multipliers', JSON.stringify(preflopMultipliers));
      window.localStorage.setItem('poker-postflop-pot-percentages', JSON.stringify(postflopPotPercentages));
      window.localStorage.setItem('poker-raise-step-mode', raiseStepMode);
    } catch {
      // 本地存储不可用不影响牌局。
    }
  }, [fourColorDeck, preflopMultipliers, postflopPotPercentages, raiseStepMode]);

  useEffect(() => {
    const syncLayout = () => {
      const isPortrait = window.innerHeight > window.innerWidth;
      setCompactLandscape(
        window.matchMedia('(orientation: landscape) and (max-height: 620px)')
          .matches,
      );
      setPortraitMobile(isPortrait && window.innerWidth < 900);
    };
    syncLayout();
    window.addEventListener('resize', syncLayout);
    window.addEventListener('orientationchange', syncLayout);
    return () => {
      window.removeEventListener('resize', syncLayout);
      window.removeEventListener('orientationchange', syncLayout);
    };
  }, []);

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

      if (roomData.currentGameId) {
        const gameData = await getGame(roomData.currentGameId);
        setGame(gameData);
      } else {
        // 牌局结束后服务端会清空 currentGameId；如果本地还停留在进行中的牌局，
        // 再拉一次最后这局的状态，确保超时自动弃牌等场景也能显示结算。
        const lastGame = lastGameRef.current;
        if (lastGame && lastGame.status !== 'finished') {
          try {
            const finalGame = await getGame(lastGame.id);
            if (finalGame.status === 'finished') {
              setGame(finalGame);
              return;
            }
          } catch {
            // 最后这局已不存在时回退到等待开局页。
          }
        }
        setGame(previous =>
          previous?.status === 'finished' ? previous : null,
        );
      }
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [roomId]);

  useEffect(() => {
    if (game) lastGameRef.current = game;
  }, [game]);

  useEffect(() => {
    fetchRoom();
  }, [fetchRoom]);

  useEffect(() => {
    if (!roomId) return;
    const interval = setInterval(fetchRoom, 1500);
    return () => clearInterval(interval);
  }, [roomId, fetchRoom]);

  useEffect(() => {
    if (!game || game.status === 'finished') return;
    const timer = setInterval(() => setNowTick(Date.now()), 500);
    return () => clearInterval(timer);
  }, [game?.id, game?.status]);

  useEffect(() => {
    if (!game?.serverNow) return;
    const serverMs = Date.parse(game.serverNow);
    if (Number.isFinite(serverMs)) {
      serverOffsetRef.current = serverMs - Date.now();
    }
  }, [game?.serverNow]);

  useEffect(() => {
    if (!room) return;
    setMessages([
      `已进入「${room.name}」`,
      `盲注 ${room.smallBlind} / ${room.bigBlind}`,
      `房间号 ${room.roomCode}`,
    ]);
  }, [room?.id]);

  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(null), 4200);
    return () => clearTimeout(timer);
  }, [error]);

  const handleLeave = async () => {
    if (!roomId) {
      navigate('/lobby', { replace: true });
      return;
    }
    try {
      // 网络卡住也不能把用户锁在牌桌里，最多等 1.5 秒就回大厅。
      await Promise.race([
        leaveRoom(roomId),
        new Promise((resolve) => setTimeout(resolve, 1500)),
      ]);
    } catch {
      // 离开失败时仍然返回大厅，避免停留在错误页。
    } finally {
      navigate('/lobby', { replace: true });
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

  const handleNextHand = async () => {
    if (!roomId) return;
    try {
      if (isHost) {
        await handleStartGame();
      } else {
        await fetchRoom();
      }
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  };

  const currentPlayerSeat = game?.currentPlayerSeat;
  const myPlayer = game?.players.find((p) => p.userId === currentUser?.id);
  const isHost = room?.hostId === currentUser?.id;
  const isMyTurn =
    currentPlayerSeat === myPlayer?.seat && game?.status !== 'finished';
  const canAct = isMyTurn && !!myPlayer && !myPlayer.isFolded;

  const maxRaise = myPlayer ? myPlayer.stack + myPlayer.betAmount : 0;
  const minRaise = game ? game.currentBet + (room?.bigBlind || 20) : 0;
  const raiseValue =
    maxRaise >= minRaise
      ? Math.max(minRaise, Math.min(raiseAmount || minRaise, maxRaise))
      : maxRaise;
  const callAmount = game
    ? Math.max(0, game.currentBet - (myPlayer?.betAmount || 0))
    : 0;
  const canRaise = maxRaise >= minRaise && (myPlayer?.stack || 0) > 0;

  const turnTimeoutSeconds = game?.turnTimeoutSeconds || 30;
  const turnStartedMs = Date.parse(
    game?.turnStartedAt || game?.startTime || '',
  );
  const turnRemaining =
    game && game.status !== 'finished' && Number.isFinite(turnStartedMs)
      ? Math.max(
          0,
          Math.ceil(
            (turnStartedMs +
              turnTimeoutSeconds * 1000 -
              (nowTick + serverOffsetRef.current)) /
              1000,
          ),
        )
      : 0;
  const turnProgress = Math.min(
    100,
    Math.max(0, (turnRemaining / turnTimeoutSeconds) * 100),
  );

  const potBase = game ? game.pot + callAmount : 0;
  const raiseStep = !room
    ? 1
    : raiseStepMode === 'fine'
      ? 1
      : raiseStepMode === 'fast'
        ? room.bigBlind
        : room.smallBlind;
  const roundToRaiseStep = (value: number) =>
    Math.round(value / raiseStep) * raiseStep;
  const raisePreset = (fraction: number) => {
    if (!game) return minRaise;
    const rounded = roundToRaiseStep(game.currentBet + potBase * fraction);
    return Math.min(maxRaise, Math.max(minRaise, rounded));
  };
  const preflopRaisePreset = (multiplier: number) => {
    if (!game) return minRaise;
    const rounded = roundToRaiseStep(game.currentBet * multiplier);
    return Math.min(maxRaise, Math.max(minRaise, rounded));
  };
  const quickRaisePresets = game?.round === 'preflop'
    ? preflopMultipliers.map((multiplier) => ({
        label: `${multiplier}×`,
        value: preflopRaisePreset(multiplier),
      }))
    : postflopPotPercentages.map((percentage) => ({
        label: `${percentage}%池`,
        value: raisePreset(percentage / 100),
      }));

  useEffect(() => {
    if (!game || !myPlayer) return;
    const next =
      maxRaise >= minRaise
        ? Math.max(minRaise, Math.min(maxRaise, minRaise))
        : maxRaise;
    setRaiseAmount(prev =>
      maxRaise >= minRaise
        ? Math.max(minRaise, Math.min(maxRaise, prev > 0 ? prev : next))
        : maxRaise,
    );
  }, [game?.id, game?.currentBet, minRaise, maxRaise]);

  const handleAction = async (
    action: 'fold' | 'check' | 'call' | 'raise' | 'allin',
    options?: { silent?: boolean; auto?: boolean },
  ) => {
    if (!game) return;
    setActionLoading(true);
    suppressPotSoundRef.current = true;
    try {
      const amount =
        action === 'raise'
          ? Math.max(minRaise, Math.min(raiseValue, maxRaise))
          : undefined;
      const gameData = await playerAction({ gameId: game.id, action, amount });
      setGame(gameData);
      const text: Record<string, string> = {
        fold: options?.auto ? '思考超时，已自动弃牌' : '你弃牌了',
        check: '你选择过牌',
        call: `你跟注 ${callAmount.toLocaleString()}`,
        raise: `你加注到 ${amount?.toLocaleString() || ''}`,
        allin: '你全下',
      };
      const spoken: Record<string, string> = {
        fold: '弃牌',
        check: '过牌',
        call: '跟注',
        raise: '加注',
        allin: '全下',
      };
      setMessages(prev => [...prev.slice(-3), text[action]]);
      if (action === 'fold') playSound('fold');
      if (action === 'check') playSound('check');
      if (action === 'call') playSound('chip');
      if (action === 'raise') playSound('raise');
      if (action === 'allin') playSound('allin');
      if (soundEnabled) speakChinese(spoken[action]);
    } catch (err) {
      if (!options?.silent) setError(extractErrorMessage(err));
    } finally {
      setActionLoading(false);
    }
  };

  // 超时后前端立即自动过牌/弃牌，服务端计时器作为兜底。
  useEffect(() => {
    if (!game || !isMyTurn || actionLoading || game.status === 'finished') {
      return;
    }
    if (turnRemaining > 0) return;
    const key = `${game.id}:${game.currentPlayerSeat}:${game.turnStartedAt}`;
    if (autoActedKeyRef.current === key) return;
    autoActedKeyRef.current = key;
    void handleAction('fold', {
      silent: true,
      auto: true,
    });
  }, [
    game?.id,
    game?.status,
    game?.currentPlayerSeat,
    game?.turnStartedAt,
    isMyTurn,
    actionLoading,
    turnRemaining,
    callAmount,
  ]);

  // 牌局音效：发牌、底池变化、轮到自己、结算。
  useEffect(() => {
    if (!game) {
      previousGameRef.current = null;
      return;
    }
    const previous = previousGameRef.current;
    if (previous && previous.id === game.id) {
      if (game.communityCards.length > previous.communityCards.length) {
        playSound('deal');
      }
      if (game.pot > previous.pot) {
        if (suppressPotSoundRef.current) {
          suppressPotSoundRef.current = false;
        } else {
          playSound('chip');
        }
      } else if (suppressPotSoundRef.current) {
        suppressPotSoundRef.current = false;
      }
      if (game.status === 'finished' && previous.status !== 'finished') {
        playSound(game.winnerIds.includes(currentUser?.id || '') ? 'win' : 'lose');
      }
    }
    previousGameRef.current = game;

    if (
      game.status !== 'finished' &&
      game.currentPlayerSeat === myPlayer?.seat
    ) {
      const turnKey = `${game.id}:${game.currentPlayerSeat}:${game.turnStartedAt}`;
      if (lastTurnKeyRef.current !== turnKey) {
        lastTurnKeyRef.current = turnKey;
        playSound('turn');
      }
    }
  }, [
    game,
    myPlayer?.seat,
    currentUser?.id,
    playSound,
  ]);

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

  const playerCount = room.players.length;
  const orderedPlayers = [...room.players].sort((a, b) => a.seat - b.seat);

  const seatLabel = (player: RoomPlayer) => {
    if (player.userId === BOT_USER_ID) return '电脑人·职业';
    if (player.nickname) return player.nickname.slice(0, 8);
    if (player.userId === currentUser?.id) return '我';
    return `玩家 ${player.seat + 1}`;
  };

  const formatChips = (value: number) =>
    value >= 1000 ? `${(value / 1000).toFixed(1)}K` : value.toLocaleString();

  const SEAT_CRESTS = ['⚓', '✦', '☠', '◆', '⚔', '✧'];
  const SEAT_PLATE_BG = [
    'linear-gradient(180deg,#2d5c3d 0%,#163524 62%,#0a1d13 100%)',
    'linear-gradient(180deg,#5b1c24 0%,#340c11 62%,#1b0508 100%)',
    'repeating-linear-gradient(135deg,#20324c 0 6px,#16253a 6px 12px),linear-gradient(180deg,#35516f,#101d2c)',
    'linear-gradient(180deg,#503d26 0%,#2e2215 62%,#170f08 100%)',
    'linear-gradient(180deg,#3d2f4e 0%,#22182e 62%,#100a17 100%)',
    'linear-gradient(180deg,#28534f 0%,#12302d 62%,#071a18 100%)',
  ];

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
      className="pokerrrr-classic-ui relative flex h-[100svh] flex-col overflow-hidden text-white"
      style={{ backgroundColor: '#120904' }}
    >
      {/* 私人牌会所背景 */}
      <div
        className="pointer-events-none absolute inset-0 bg-cover"
        style={{
          backgroundImage: "url('/images/club-room.jpg')",
          backgroundPosition: 'center 38%',
        }}
      />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_22%,rgba(255,186,110,.14),transparent_52%)]" />
      <div className="pointer-events-none absolute inset-0 bg-black/32" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_30%,rgba(0,0,0,.62)_100%)]" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[36%] bg-gradient-to-t from-black/55 to-transparent" />

      {/* 顶部信息 */}
      <header
        className={`relative z-50 flex shrink-0 items-center justify-between px-3 ${
          compactLandscape ? 'py-1' : 'pb-1 pt-2'
        } sm:px-5`}
        style={
          portraitMobile
            ? { paddingTop: 'max(8px, env(safe-area-inset-top))' }
            : undefined
        }
      >
        <button
          onClick={() => navigate('/lobby', { replace: true })}
          title="返回大厅，座位保留"
          className={`flex items-center justify-center rounded-full border border-[#b9975b]/55 bg-[radial-gradient(circle_at_35%_25%,#3b2518,#150a06_72%)] text-[#e4c88b] shadow-[0_3px_10px_rgba(0,0,0,.55),inset_0_1px_0_rgba(255,235,190,.18)] backdrop-blur transition hover:border-[#e0bf78] hover:text-[#ffe6b2] ${
            compactLandscape ? 'h-7 w-7' : 'h-10 w-10'
          }`}
          aria-label="返回大厅"
        >
          <ArrowLeft className={compactLandscape ? 'h-4 w-4' : 'h-5 w-5'} />
        </button>

        <div className="min-w-0 rounded-full border border-[#d8b478]/45 bg-[linear-gradient(180deg,#1a1814_0%,#050504_62%,#18150f_100%)] px-4 py-[5px] text-center shadow-[0_4px_16px_rgba(0,0,0,.65),inset_0_1px_0_rgba(255,236,190,.24),inset_0_-2px_4px_rgba(0,0,0,.8)]">
          <div className="truncate font-serif text-[clamp(11px,1vw,14px)] font-bold tracking-[0.12em] text-[#f4e6c2]">
            {formatChips(room.smallBlind)}/{formatChips(room.bigBlind)}
            <span className="ml-1.5 text-[#d8b478]/65">#{room.roomCode}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={toggleSound}
            className={`flex items-center justify-center rounded-full border border-[#b9975b]/55 bg-[radial-gradient(circle_at_35%_25%,#3b2518,#150a06_72%)] text-[#e4c88b] shadow-[0_3px_10px_rgba(0,0,0,.55),inset_0_1px_0_rgba(255,235,190,.18)] backdrop-blur transition hover:border-[#e0bf78] hover:text-[#ffe6b2] ${
              compactLandscape ? 'h-7 w-7' : 'h-10 w-10'
            }`}
            aria-label={soundEnabled ? '关闭音效' : '开启音效'}
            title={soundEnabled ? '音效已开启' : '音效已关闭'}
          >
            {soundEnabled ? (
              <Volume2 className={compactLandscape ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
            ) : (
              <VolumeX className={compactLandscape ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
            )}
          </button>
          <button
            onClick={() => setTableMenuOpen((open) => !open)}
            aria-label="打开牌桌设置"
            aria-expanded={tableMenuOpen}
            title="牌桌设置"
            className={`flex items-center justify-center rounded-full border border-[#b9975b]/55 bg-[radial-gradient(circle_at_35%_25%,#3b2518,#150a06_72%)] text-[#e4c88b] shadow-[0_3px_10px_rgba(0,0,0,.55),inset_0_1px_0_rgba(255,235,190,.18)] backdrop-blur transition hover:border-[#e0bf78] hover:text-[#ffe6b2] ${
              compactLandscape ? 'h-7 w-7' : 'h-10 w-10'
            }`}
          >
            <Settings2 className={compactLandscape ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
          </button>
          <button
            onClick={handleLeave}
            className={`flex items-center justify-center rounded-full border border-[#b9975b]/55 bg-[radial-gradient(circle_at_35%_25%,#3b2518,#150a06_72%)] text-[#e4c88b] shadow-[0_3px_10px_rgba(0,0,0,.55),inset_0_1px_0_rgba(255,235,190,.18)] backdrop-blur transition hover:border-red-400/70 hover:text-red-300 ${
              compactLandscape ? 'h-7 w-7' : 'h-10 w-10'
            }`}
            aria-label="离开房间"
          >
            <LogOut className={compactLandscape ? 'h-3.5 w-3.5' : 'h-4.5 w-4.5'} />
          </button>
        </div>
      </header>

      {tableMenuOpen && (
        <aside
          role="dialog"
          aria-label="牌桌设置"
          className="absolute right-3 top-[58px] z-[65] max-h-[calc(100svh-80px)] w-[min(92vw,350px)] overflow-y-auto rounded-xl border border-[#d8b478]/45 bg-[#100b07]/[.97] shadow-[0_20px_60px_rgba(0,0,0,.8)] backdrop-blur-xl"
        >
          <div className="flex items-center justify-between border-b border-[#d8b478]/20 px-4 py-3">
            <div>
              <div className="font-serif text-sm font-bold tracking-[0.14em] text-[#f3dfb5]">牌桌设置</div>
              <div className="mt-0.5 text-[10px] text-white/40">显示偏好、下注预设与房间信息</div>
            </div>
            <button
              onClick={() => setTableMenuOpen(false)}
              aria-label="关闭设置"
              className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/65 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-3 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-semibold text-white/90">牌桌音效</div>
                <div className="mt-0.5 text-[10px] text-white/40">发牌、下注与轮到你行动时播放提示音</div>
              </div>
              <button
                onClick={toggleSound}
                aria-pressed={soundEnabled}
                className={`rounded-full border px-3 py-1.5 text-[11px] font-bold transition ${
                  soundEnabled
                    ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-200'
                    : 'border-white/15 bg-white/5 text-white/50'
                }`}
              >
                {soundEnabled ? '开启' : '关闭'}
              </button>
            </div>

            <div className="h-px bg-white/10" />

            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-semibold text-white/90">四色牌组</div>
                <div className="mt-0.5 text-[10px] text-white/40">黑桃蓝色、红桃红色、方块橙色、梅花绿色</div>
              </div>
              <button
                onClick={() => setFourColorDeck((enabled) => !enabled)}
                aria-pressed={fourColorDeck}
                className={`rounded-full border px-3 py-1.5 text-[11px] font-bold transition ${
                  fourColorDeck
                    ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-200'
                    : 'border-white/15 bg-white/5 text-white/50'
                }`}
              >
                {fourColorDeck ? '开启' : '关闭'}
              </button>
            </div>

            <div className="h-px bg-white/10" />

            <div className="space-y-3">
              <div>
                <div className="text-[10px] font-semibold tracking-[0.12em] text-[#d8b478]/75">翻牌前快捷加注</div>
                <div className="mt-0.5 text-[10px] text-white/40">按当前下注额的倍数计算加注到的总金额</div>
                <div className="mt-2 grid grid-cols-4 gap-2">
                  {preflopMultipliers.map((_value, index) => (
                    <label key={index} className="min-w-0 text-center">
                      <span className="mb-1 block text-[9px] text-white/45">预设 {index + 1}</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={preflopMultiplierInputs[index]}
                        onChange={(event) => {
                          const next = event.target.value;
                          setPreflopMultiplierInputs((current) =>
                            current.map((item, itemIndex) => itemIndex === index ? next : item),
                          );
                        }}
                        onBlur={() => {
                          const parsed = Number(preflopMultiplierInputs[index]);
                          const safe = Number.isFinite(parsed)
                            ? Math.min(20, Math.max(1.1, parsed))
                            : DEFAULT_PREFLOP_MULTIPLIERS[index];
                          setPreflopMultipliers((current) =>
                            current.map((item, itemIndex) => itemIndex === index ? safe : item),
                          );
                          setPreflopMultiplierInputs((current) =>
                            current.map((item, itemIndex) => itemIndex === index ? String(safe) : item),
                          );
                        }}
                        className="h-8 w-full min-w-0 rounded border border-white/15 bg-black/50 px-1 text-center text-xs font-bold text-white outline-none focus:border-[#d8b478]/70"
                      />
                    </label>
                  ))}
                </div>
                <div className="mt-1 text-[9px] text-white/35">默认：2×、2.5×、3×、4×</div>
              </div>

              <div className="h-px bg-white/10" />

              <div>
                <div className="text-[10px] font-semibold tracking-[0.12em] text-[#d8b478]/75">翻牌后底池比例</div>
                <div className="mt-0.5 text-[10px] text-white/40">按当前底池百分比计算加注到的总金额</div>
                <div className="mt-2 grid grid-cols-4 gap-2">
                  {postflopPotPercentages.map((_value, index) => (
                    <label key={index} className="min-w-0 text-center">
                      <span className="mb-1 block text-[9px] text-white/45">预设 {index + 1}</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={postflopPercentageInputs[index]}
                        onChange={(event) => {
                          const next = event.target.value;
                          setPostflopPercentageInputs((current) =>
                            current.map((item, itemIndex) => itemIndex === index ? next : item),
                          );
                        }}
                        onBlur={() => {
                          const parsed = Number(postflopPercentageInputs[index]);
                          const safe = Number.isFinite(parsed)
                            ? Math.min(200, Math.max(10, parsed))
                            : DEFAULT_POSTFLOP_POT_PERCENTAGES[index];
                          setPostflopPotPercentages((current) =>
                            current.map((item, itemIndex) => itemIndex === index ? safe : item),
                          );
                          setPostflopPercentageInputs((current) =>
                            current.map((item, itemIndex) => itemIndex === index ? String(safe) : item),
                          );
                        }}
                        className="h-8 w-full min-w-0 rounded border border-white/15 bg-black/50 px-1 text-center text-xs font-bold text-white outline-none focus:border-[#d8b478]/70"
                      />
                    </label>
                  ))}
                </div>
                <div className="mt-1 text-[9px] text-white/35">默认：33%、50%、75%、100%；可设置 10%–200%</div>
              </div>

              <div className="h-px bg-white/10" />

              <div>
                <div className="text-[10px] font-semibold tracking-[0.12em] text-[#d8b478]/75">金额调整灵敏度</div>
                <div className="mt-0.5 text-[10px] text-white/40">控制加减按钮和滑块每次调整的筹码数量</div>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {([
                    { value: 'fine', label: '精细', description: '每次 +1' },
                    { value: 'normal', label: '标准', description: `每次 +${room.smallBlind}` },
                    { value: 'fast', label: '快速', description: `每次 +${room.bigBlind}` },
                  ] as const).map((option) => (
                    <button
                      key={option.value}
                      onClick={() => setRaiseStepMode(option.value)}
                      aria-pressed={raiseStepMode === option.value}
                      className={`rounded border px-1 py-2 text-center transition ${
                        raiseStepMode === option.value
                          ? 'border-[#d8b478]/70 bg-[#d8b478]/15 text-[#f3dfb5]'
                          : 'border-white/10 bg-white/5 text-white/55'
                      }`}
                    >
                      <span className="block text-[11px] font-bold">{option.label}</span>
                      <span className="mt-0.5 block text-[9px] opacity-65">{option.description}</span>
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={() => {
                  setPreflopMultipliers([...DEFAULT_PREFLOP_MULTIPLIERS]);
                  setPreflopMultiplierInputs(DEFAULT_PREFLOP_MULTIPLIERS.map(String));
                  setPostflopPotPercentages([...DEFAULT_POSTFLOP_POT_PERCENTAGES]);
                  setPostflopPercentageInputs(DEFAULT_POSTFLOP_POT_PERCENTAGES.map(String));
                  setRaiseStepMode('normal');
                }}
                className="w-full rounded border border-white/15 bg-white/5 px-3 py-2 text-[10px] font-semibold text-white/65 transition hover:border-[#d8b478]/45 hover:text-[#f3dfb5]"
              >
                恢复默认下注设置
              </button>
            </div>

            <div className="h-px bg-white/10" />

            <div className="space-y-2">
              <div className="text-[10px] font-semibold tracking-[0.12em] text-[#d8b478]/75">当前牌桌信息</div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-white/45">房间名称</span>
                <span className="max-w-[190px] truncate text-white/85">{room.name}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-white/45">房间号码</span>
                <span className="font-mono font-bold tracking-[0.12em] text-[#f0d79d]">{room.roomCode}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-white/45">大小盲注</span>
                <span className="text-white/85">{room.smallBlind.toLocaleString()} / {room.bigBlind.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-white/45">当前人数</span>
                <span className="text-white/85">{room.players.length} / {room.maxPlayers}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-white/45">带入范围</span>
                <span className="text-white/85">{room.minBuyin.toLocaleString()} - {room.maxBuyin.toLocaleString()}</span>
              </div>
            </div>
          </div>
        </aside>
      )}

      {/* 思考倒计时 */}
      {game && game.status !== 'finished' && game.currentPlayerSeat !== null && !portraitMobile && (
        <div className={`pointer-events-none absolute left-1/2 z-40 -translate-x-1/2 ${compactLandscape ? 'top-[34px]' : portraitMobile ? 'top-[54px]' : 'top-[48px]'}`}>
          <div
            aria-label={`思考时间 ${turnRemaining} 秒`}
            className={`flex items-center rounded-full border-2 font-serif shadow-[0_6px_18px_rgba(0,0,0,.7)] backdrop-blur ${
              compactLandscape ? 'gap-1.5 px-2.5 py-0.5' : 'gap-2 px-4 py-1.5'
            } ${
              turnRemaining <= 10
                ? 'border-red-400/70 bg-[#2a0808]/90 text-red-300'
                : 'border-[#d8b478]/55 bg-black/70 text-[#f1dcaa]'
            }`}
          >
            <Clock className={compactLandscape ? 'h-3.5 w-3.5' : 'h-5 w-5'} />
            <span className={`font-semibold tracking-[0.16em] ${compactLandscape ? 'text-[9px]' : 'text-[11px]'}`}>
              思考
            </span>
            <span
              className={`min-w-[2ch] text-center font-mono font-black leading-none tabular-nums ${
                compactLandscape ? 'text-[18px]' : 'text-[clamp(22px,2.4svh,27px)]'
              } ${turnRemaining <= 10 ? 'animate-pulse' : ''}`}
            >
              {turnRemaining > 0 ? turnRemaining : '超时'}
            </span>
            {turnRemaining > 0 && (
              <span className={`${compactLandscape ? 'text-[10px]' : 'text-[12px]'} font-bold opacity-80`}>
                秒
              </span>
            )}
          </div>
        </div>
      )}

      {/* 牌桌 */}
      <main
        className={`poker-table-stage relative z-10 flex min-h-0 flex-1 justify-center ${
          portraitMobile ? 'items-center px-1 pb-0 pt-0' : 'items-center px-1 py-1'
        }`}
      >
        <div
          className={`relative ${
            portraitMobile
              ? 'aspect-[0.95/1]'
              : compactLandscape
                ? 'aspect-[2.15/1]'
                : 'aspect-[1.5/1] sm:aspect-[1.95/1]'
          }`}
          style={{
            width: portraitMobile
              ? 'min(100%, 430px)'
              : compactLandscape
                ? 'min(100%, calc((100svh - 142px) * 2.15))'
                : 'min(100%, calc((100svh - 154px) * 1.95))',
          }}
        >
          {/* 桌体 */}
          <div
            className={`poker-table-wood absolute inset-x-[3%] rounded-[999px] border-2 border-[#b9925a]/50 bg-[linear-gradient(180deg,#7a4727_0%,#522a16_22%,#33180c_58%,#180b05_84%,#070301_100%)] p-[clamp(9px,1.35vw,17px)] shadow-[0_36px_90px_rgba(0,0,0,.9),0_8px_0_rgba(0,0,0,.35),inset_0_3px_2px_rgba(255,224,170,.22),inset_0_-5px_10px_rgba(0,0,0,.6)] ${
              portraitMobile ? 'top-[12%] bottom-[10%]' : 'inset-y-[9%]'
            }`}
          >
            <div className="absolute inset-[2px] rounded-[999px] border border-[#f0d296]/30" />
            <div className="absolute inset-[5px] rounded-[999px] border border-[#2a1207]/80" />
            <div className="poker-table-felt relative h-full w-full rounded-[999px] border border-[#e5c68a]/60 bg-[#0c2116] p-[clamp(3px,0.4vw,5px)] shadow-[inset_0_0_22px_rgba(0,0,0,.8),0_1px_0_rgba(255,235,190,.22)]">
              <div
                className="relative h-full w-full overflow-hidden rounded-[999px] border border-[#08271a]/90"
                style={{
                  background:
                    'radial-gradient(ellipse at 50% 38%, #447a55 0%, #306244 30%, #1e4a32 58%, #113523 82%, #082116 100%)',
                  boxShadow:
                    'inset 0 0 90px rgba(0,0,0,.62), inset 0 0 28px rgba(255,220,150,.1), 0 0 0 1px rgba(255,239,198,.1)',
                }}
              >
                <div className="absolute inset-x-[8%] top-[7%] h-px bg-gradient-to-r from-transparent via-[#f4dca8]/20 to-transparent" />
                <div className="absolute inset-x-[11%] bottom-[9%] h-px bg-gradient-to-r from-transparent via-[#f4dca8]/12 to-transparent" />
                <div className="absolute inset-[5%] rounded-[999px] border border-[#f0d499]/[0.07]" />
                <div className="absolute inset-[9%] rounded-[999px] border border-[#f0d499]/[0.04]" />
              </div>
            </div>
          </div>

          {/* 公共牌 */}
          {game && (
          <div
            className={`absolute left-1/2 z-20 flex -translate-x-1/2 -translate-y-1/2 items-center gap-[clamp(3px,0.42vw,6px)] ${
              compactLandscape
                ? 'top-[50%]'
                : portraitMobile
                  ? 'top-[47%]'
                  : 'top-[45%]'
            }`}
          >
            {Array.from({ length: 5 }).map((_, i) => {
              const card = game.communityCards?.[i];
              return (
                <TableCard
                  key={i}
                  card={card}
                  faceDown={!card}
                  size="community"
                  compact={compactLandscape}
                  fourColorDeck={fourColorDeck}
                />
              );
            })}
          </div>
          )}

          {/* 底池：桌面上方筹码牌 */}
          {game && (
          <div
            className={`absolute left-1/2 z-20 -translate-x-1/2 ${
              compactLandscape
                ? 'top-[27%]'
                : portraitMobile
                  ? 'top-[31%]'
                  : 'top-[27%]'
            }`}
          >
            <div
              className={`flex items-center rounded-full border border-[#cbb488]/60 bg-[#f1e6cd] shadow-[0_6px_18px_rgba(0,0,0,.55),inset_0_1px_0_rgba(255,255,255,.7)] ${
                compactLandscape ? 'gap-1 px-2 py-0' : 'gap-1.5 px-3 py-[3px]'
              }`}
            >
              <ChipIcon
                className={
                  compactLandscape
                    ? 'h-2.5 w-2.5'
                    : 'h-[clamp(13px,1.4vw,18px)] w-[clamp(13px,1.4vw,18px)]'
                }
              />
              <span
                className={`font-serif font-black tracking-[0.06em] text-[#3a2412] ${
                  compactLandscape ? 'text-[9px]' : 'text-[clamp(11px,1.3vw,17px)]'
                }`}
              >
                $ {(game?.pot || 0).toLocaleString()}
              </span>
            </div>
          </div>
          )}

          {/* 底池：桌面下方文字 */}
          {game && (
          <div
            className={`absolute left-1/2 z-20 -translate-x-1/2 whitespace-nowrap font-serif tracking-[0.08em] text-[#e9e3d2]/85 [text-shadow:0_2px_6px_rgba(0,0,0,.85)] ${
              compactLandscape
                ? 'top-[61%] text-[10px]'
                : portraitMobile
                  ? 'top-[62%] text-[13px]'
                  : 'top-[63%] text-[clamp(12px,1.25vw,17px)]'
            }`}
          >
            底池 : {(game?.pot || 0).toLocaleString()}
          </div>
          )}
          {(game?.sidePots?.length || 0) > 1 && (
            <div
              className={`absolute left-1/2 z-20 -translate-x-1/2 text-center text-[9px] text-white/45 ${
                compactLandscape
                  ? 'top-[67%]'
                  : portraitMobile
                    ? 'top-[65%]'
                    : 'top-[69%]'
              }`}
            >
              {game!.sidePots.length - 1} 个边池
            </div>
          )}

          {/* 座位 */}
          {orderedPlayers.map((player, index) => {
            const { x, y } = seatPoint(
              index,
              orderedPlayers.length,
              portraitMobile ? 34 : compactLandscape ? 30 : 34,
              portraitMobile ? 39 : compactLandscape ? 40 : 41,
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

            const betX = portraitMobile
              ? isMe
                ? x + 9
                : x < 50
                  ? x + 7
                  : x - 7
              : isMe
                ? x
                : x < 50
                  ? x + 7
                  : x - 7;
            const betY = portraitMobile
              ? isMe
                ? y - 7
                : y < 50
                  ? y + 6
                  : y - 6
              : isMe
                ? y - 9
                : y < 50
                  ? 50 + (y - 50) * 0.58
                  : 50 + (y - 50) * 0.72;
            const avatarOnRight = x > 62;

            return (
              <React.Fragment key={player.seat}>
                {bet > 0 &&
                  !folded &&
                  game &&
                  (portraitMobile
                    ? !isMe
                    : !compactLandscape &&
                      !(Math.abs(x - 50) < 8 && y < 30)) && (
                  <div
                    className="absolute z-20 -translate-x-1/2 -translate-y-1/2"
                    style={{ left: `${betX}%`, top: `${betY}%` }}
                  >
                    <div
                      className={`flex items-center rounded-full border border-[#c7a468]/35 bg-[#140c07]/90 shadow-lg ${
                        compactLandscape ? 'gap-1 py-0 pl-1 pr-2' : 'gap-1.5 py-0.5 pl-1 pr-2.5'
                      }`}
                    >
                      <ChipIcon className="h-4 w-4" />
                      <span
                        className={`font-bold text-[#f0dca9]/90 ${
                          compactLandscape ? 'text-[8px]' : 'text-[clamp(9px,1vw,12px)]'
                        }`}
                      >
                        $ {bet.toLocaleString()}
                      </span>
                    </div>
                  </div>
                )}

                {isMe && game && gp && !folded && !portraitMobile && (
                  <div
                    className="pointer-events-none absolute z-40 flex -translate-y-1/2 items-end"
                    style={{
                      left: `${
                        y < 40
                          ? Math.max(28, x - 14)
                          : Math.min(78, x + 9.5)
                      }%`,
                      top: `${
                        compactLandscape
                          ? y < 50
                            ? y + 7
                            : y - 11
                          : y < 40
                            ? y + 8
                            : y - 2
                      }%`,
                    }}
                  >
                    {[0, 1].map((cardIndex) => (
                      <div
                        key={cardIndex}
                        className={
                          cardIndex === 0
                            ? '-rotate-6'
                            : 'ml-[-7px] rotate-3'
                        }
                      >
                        <TableCard
                          card={gp.holeCards?.[cardIndex]}
                          faceDown={!gp.holeCards?.[cardIndex]}
                          size="hole"
                          compact={compactLandscape}
                          fourColorDeck={fourColorDeck}
                        />
                      </div>
                    ))}
                  </div>
                )}

                <div
                  className="absolute z-30 -translate-x-1/2 -translate-y-1/2"
                  style={{ left: `${x}%`, top: `${y}%` }}
                >
                  <div
                    className={`relative flex items-center gap-1 transition ${
                      avatarOnRight ? 'flex-row-reverse' : ''
                    } ${folded ? 'opacity-45 saturate-50' : ''}`}
                  >                    {/* 小头像 + 暗牌 */}
                    <div className="relative shrink-0">
                      {game && gp && !folded && !isMe && (
                        <div className="absolute -left-2 -top-1 z-0 flex items-start">
                          {[0, 1].map((i) => (
                            <div
                              key={i}
                              className={i === 0 ? '-rotate-12' : 'ml-[-8px] mt-0.5 rotate-6'}
                            >
                              <TableCard
                                faceDown
                                size="mini"
                                compact={compactLandscape}
                                fourColorDeck={fourColorDeck}
                              />
                            </div>
                          ))}
                        </div>
                      )}
                      <div
                        className={`relative z-10 overflow-hidden rounded-[4px] bg-black shadow-[0_6px_16px_rgba(0,0,0,.75)] ${
                          isTurn
                            ? 'border-2 border-[#8be08d] shadow-[0_0_0_2px_rgba(86,210,115,.2),0_0_22px_rgba(121,227,139,.55)]'
                            : isWinner
                              ? 'border-2 border-[#f4cf5f]'
                              : 'border border-[#d8bd88]/75'
                        } ${
                          compactLandscape
                            ? 'h-[clamp(28px,7.4svh,38px)] w-[clamp(20px,5.4svh,28px)]'
                            : portraitMobile
                              ? 'h-[36px] w-[27px]'
                              : 'h-[clamp(44px,5.3vw,66px)] w-[clamp(32px,4vw,50px)]'
                        }`}
                      >
                        <img
                          src={avatar}
                          alt=""
                          draggable={false}
                          className="h-full w-full object-cover object-center"
                        />
                        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent" />
                        {allIn && (
                          <div className="absolute inset-x-0 top-[46%] -translate-y-1/2 bg-[#b61d3c]/95 py-0.5 text-center text-[6px] font-black tracking-[0.08em] text-white">
                            全下
                          </div>
                        )}
                      </div>
                      {badges.length > 0 && (
                        <div className="absolute -left-1 -top-1 z-20 flex gap-0.5">
                          {badges.map((badge) => (
                            <span
                              key={badge}
                              className={`flex h-[clamp(13px,1.4vw,18px)] w-[clamp(13px,1.4vw,18px)] items-center justify-center rounded-full border text-[clamp(7px,0.8vw,9px)] font-black ${
                                badge === 'D'
                                  ? 'border-[#f3cf5b] bg-[#c69a2a] text-[#111]'
                                  : 'border-white/45 bg-[#182632] text-white'
                              }`}
                            >
                              {badge}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* 纹章名牌 */}
                    <div
                      className={`poker-player-plaque relative shrink-0 overflow-hidden rounded-[5px] border-2 text-center shadow-[0_6px_16px_rgba(0,0,0,.65),inset_0_1px_0_rgba(255,238,196,.16)] ${
                        isTurn && !folded
                          ? 'border-[#8be08d]'
                          : isMe
                            ? 'border-[#e0c083]'
                            : 'border-[#d3b27a]/85'
                      } ${
                        compactLandscape
                          ? 'w-[clamp(66px,12svh,92px)]'
                          : portraitMobile
                            ? 'w-[clamp(58px,16.5vw,70px)]'
                            : 'w-[clamp(100px,10.4vw,134px)]'
                      }`}
                      style={{
                        background:
                          isTurn && !folded
                            ? 'linear-gradient(180deg,#3a7c51 0%,#1a4229 58%,#0b2116 100%)'
                            : isMe
                              ? 'linear-gradient(180deg,#2f5f43 0%,#173726 58%,#091c13 100%)'
                              : SEAT_PLATE_BG[player.seat % SEAT_PLATE_BG.length],
                      }}
                    >
                      <div
                        className="pointer-events-none absolute inset-0 opacity-[0.16]"
                        style={{
                          backgroundImage:
                            'repeating-linear-gradient(45deg,rgba(255,240,200,.4) 0 1px,transparent 1px 5px)',
                        }}
                      />
                      <div className="pointer-events-none absolute inset-[2px] rounded-[3px] border border-[#f0d296]/25" />
                      <div
                        className={`absolute left-1 top-[3px] font-serif leading-none text-[#f0dca9]/80 ${
                          compactLandscape
                            ? 'text-[8px]'
                            : portraitMobile
                              ? 'text-[9px]'
                              : 'text-[11px]'
                        }`}
                      >
                        {player.userId === BOT_USER_ID
                          ? '⚙'
                          : SEAT_CRESTS[player.seat % SEAT_CRESTS.length]}
                      </div>
                      <div
                        className={`relative truncate px-2 pt-[3px] font-serif font-bold leading-tight tracking-[0.03em] text-[#f7ebca] ${
                          compactLandscape
                            ? 'text-[8px]'
                            : portraitMobile
                              ? 'text-[9px]'
                              : 'text-[clamp(10px,0.98vw,13px)]'
                        }`}
                      >
                        {seatLabel(player)}
                        {player.userId === BOT_USER_ID && (
                          <span className="ml-0.5 text-[6px] tracking-[0.1em] text-[#a9d6b0]">
                            BOT
                          </span>
                        )}
                      </div>
                      <div className="mx-1 mt-[2px] flex items-center justify-center gap-0.5 border-t border-[#f0d296]/25 pb-[2px] pt-[1px]">
                        <ChipIcon className="h-2 w-2" />
                        <span
                          className={`font-serif font-black tracking-wide text-[#f6d987] ${
                            compactLandscape
                              ? 'text-[8px]'
                              : portraitMobile
                                ? 'text-[10px]'
                                : 'text-[clamp(9px,0.95vw,12px)]'
                          }`}
                        >
                          {formatChips(stack)}
                        </span>
                      </div>
                    </div>

                    {(folded || (isTurn && !folded)) && (
                      <div
                        className={`absolute -top-3 left-1/2 z-40 -translate-x-1/2 whitespace-nowrap rounded-full border px-1.5 py-0.5 font-serif text-[7px] font-black uppercase tracking-[0.12em] backdrop-blur ${
                          folded
                            ? 'border-white/15 bg-black/70 text-white/45'
                            : 'border-[#8be08d]/45 bg-[#102b1a]/95 text-[#b6f0bf]'
                        }`}
                      >
                        {folded ? '已弃牌' : '行动'}
                      </div>
                    )}
                  </div>
                </div>
              </React.Fragment>
            );
          })}

          {/* 等待开局 */}
          {room.status === 'waiting' && (
            <div className="absolute left-1/2 top-[50%] z-40 w-[min(86%,340px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-white/15 bg-[#040b12]/85 p-4 text-center shadow-[0_24px_70px_rgba(0,0,0,.8)] backdrop-blur-md">
              <div className="text-[10px] font-semibold tracking-[0.35em] text-[#70c8ff]/80">
                等待中
              </div>
              <div className="mt-2 text-lg font-bold">
                {playerCount >= room.maxPlayers ? '人数已满' : '等待玩家加入'}
              </div>
              <div className="mt-1 text-xs text-white/50">
                {playerCount} / {room.maxPlayers} 人 · 盲注 {room.smallBlind}/{room.bigBlind}
              </div>
              {playerCount < room.maxPlayers && (
                <div className="mt-3 text-[11px] text-white/35">
                  邀请好友输入房间号
                  <span className="ml-1 rounded bg-white/10 px-1.5 py-0.5 font-mono text-white/70">
                    {room.roomCode}
                  </span>
                </div>
              )}
              {!isHost && playerCount >= 2 && (
                <div className="mt-3 text-[11px] text-[#f0d58c]/75">
                  等待房主开始牌局
                </div>
              )}
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
            <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/65 px-4 backdrop-blur-[2px]">
              <div className="w-full max-w-[360px] rounded-2xl border border-[#f4cf5f]/30 bg-[#050b12]/95 p-5 text-center shadow-[0_30px_90px_rgba(0,0,0,.85)]">
                <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full border border-[#f4cf5f]/40 bg-[#f4cf5f]/10">
                  <Trophy className="h-5 w-5 text-[#f4cf5f]" />
                </div>
                <div className="mt-3 text-[10px] font-semibold tracking-[0.32em] text-white/40">
                  牌局结算
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
                    onClick={handleNextHand}
                    className="rounded-[4px] border border-[#9f853a] bg-gradient-to-b from-[#d9b95c] to-[#8e6d20] px-5 py-2 text-xs font-black text-[#111]"
                  >
                    {isHost ? '再来一局' : '刷新牌局'}
                  </button>
                  <button
                    onClick={handleLeave}
                    className="rounded-[4px] border border-white/15 bg-white/5 px-5 py-2 text-xs text-white/60"
                  >
                    返回大厅
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* 竖屏 Peek 手牌区（Pokerrrr 风格） */}
      {portraitMobile && game && game.status !== 'finished' && (
        <section className="poker-hole-peek-panel relative z-30 h-[clamp(210px,33svh,300px)] shrink-0 overflow-hidden border-y-2 border-[#d4b478]/55 bg-[#123524] shadow-[0_-14px_40px_rgba(0,0,0,.65),inset_0_1px_0_rgba(255,238,196,.18)]">
          <div
            className="absolute inset-0"
            style={{
              background:
                'radial-gradient(ellipse at 50% 38%,#2f6a47 0%,#1d4e33 48%,#0d2b1d 100%)',
            }}
          />
          <img
            src="/images/banknote.jpg"
            alt=""
            draggable={false}
            className="pointer-events-none absolute left-[-6%] top-[-18%] h-[136%] w-[112%] -rotate-3 object-cover opacity-80"
          />
          <div className="pointer-events-none absolute inset-0 bg-[#0b3a25]/35 mix-blend-multiply" />
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_20%,rgba(0,0,0,.6)_100%)]" />
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#f5dea6]/70 to-transparent" />

          {/* 手机竖屏：倒计时放在手牌正上方 */}
          {game.currentPlayerSeat !== null && (
            <div className="pointer-events-none absolute left-1/2 top-[12%] z-30 -translate-x-1/2">
              <div
                aria-label={`思考时间 ${turnRemaining} 秒`}
                className={`flex items-center gap-2 rounded-full border-2 px-3 py-1 font-serif shadow-[0_5px_16px_rgba(0,0,0,.75)] backdrop-blur ${
                  turnRemaining <= 10
                    ? 'border-red-400/70 bg-[#2a0808]/90 text-red-300'
                    : 'border-[#d8b478]/65 bg-black/75 text-[#f1dcaa]'
                }`}
              >
                <Clock className="h-4 w-4" />
                <span className="text-[10px] font-semibold tracking-[0.12em]">思考</span>
                <span className={`min-w-[2ch] text-center font-mono text-[20px] font-black leading-none tabular-nums ${turnRemaining <= 10 ? 'animate-pulse' : ''}`}>
                  {turnRemaining > 0 ? turnRemaining : '超时'}
                </span>
                {turnRemaining > 0 && <span className="text-[11px] font-bold opacity-80">秒</span>}
              </div>
            </div>
          )}

          {/* 左侧看牌箭头 */}
          <div className="absolute left-2 top-1/2 z-20 flex -translate-y-1/2 flex-col items-center gap-1 text-[#f3dfa9]">
            <span className="text-[13px] leading-none drop-shadow-[0_2px_4px_rgba(0,0,0,.8)]">⌃</span>
            <div className="h-10 w-[3px] rounded-full bg-gradient-to-b from-[#f3dfa9]/20 via-[#f3dfa9]/75 to-[#f3dfa9]/20 shadow-[0_0_8px_rgba(243,223,169,.45)]" />
            <span className="text-[13px] leading-none drop-shadow-[0_2px_4px_rgba(0,0,0,.8)]">⌄</span>
          </div>
          <div className="absolute left-[18px] top-2 z-20 font-serif text-[9px] tracking-[0.24em] text-[#f1dda8]/75">
            看牌
          </div>
          {(myPlayer?.betAmount || 0) > 0 && (
            <div className="absolute right-3 top-2 z-20 rounded-full border border-[#d8b478]/35 bg-black/35 px-2 py-[2px] font-serif text-[9px] font-bold text-[#f4dfa9]/85">
              本街下注 ${myPlayer?.betAmount.toLocaleString()}
            </div>
          )}

          {/* 我的两张手牌 */}
          <div className="absolute bottom-[7%] left-[8%] z-20 flex items-end">
            {[0, 1].map((i) => {
              const holeCard = myPlayer?.holeCards?.[i];
              return (
                <div
                  key={i}
                  className={`drop-shadow-[0_10px_18px_rgba(0,0,0,.8)] ${
                    i === 0 ? '-rotate-[18deg]' : 'ml-[-16px] rotate-[7deg]'
                  }`}
                >
                  <TableCard
                    card={holeCard}
                    faceDown={!holeCard}
                    size="peek"
                    fourColorDeck={fourColorDeck}
                  />
                </div>
              );
            })}
          </div>

          {/* 右侧筹码堆 */}
          <div className="absolute bottom-[8%] right-[7%] z-20 flex flex-col items-center">
            <div className="relative h-[54px] w-[62px]">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="absolute left-1/2 h-[13px] w-[52px] -translate-x-1/2 rounded-[50%] border border-[#f1d794]/70 shadow-[0_3px_6px_rgba(0,0,0,.55),inset_0_1px_0_rgba(255,246,210,.5)]"
                  style={{
                    bottom: `${i * 11}px`,
                    background:
                      i % 2 === 0
                        ? 'radial-gradient(ellipse at 50% 30%,#e2bd63,#a9781f 68%,#5d3d09)'
                        : 'radial-gradient(ellipse at 50% 30%,#cf4b45,#8d221e 70%,#480d0b)',
                  }}
                >
                  <span className="absolute inset-x-3 top-1/2 h-[3px] -translate-y-1/2 rounded-full border-y border-white/25" />
                </div>
              ))}
            </div>
            <span className="mt-1 font-serif text-[11px] font-black tracking-[0.04em] text-[#f7df9c] [text-shadow:0_2px_4px_rgba(0,0,0,.9)]">
              {formatChips(myPlayer?.stack ?? 0)}
            </span>
          </div>

        </section>
      )}

      {/* 底部操作区 */}
      {game && game.status !== 'finished' && (
        <footer
          className={`relative z-40 shrink-0 px-2 ${
            compactLandscape ? 'pb-1 pt-0' : 'pb-2 pt-1'
          } sm:px-5 sm:pb-4`}
          style={
            portraitMobile
              ? { paddingBottom: 'max(8px, env(safe-area-inset-bottom))' }
              : undefined
          }
        >
          {canAct && (
            <div className="absolute inset-x-2 top-0 h-[3px] overflow-hidden rounded-full bg-black/45">
              <div
                className={`h-full rounded-full transition-[width] duration-500 ease-linear ${
                  turnRemaining <= 10
                    ? 'bg-gradient-to-r from-red-700 to-red-400'
                    : 'bg-gradient-to-r from-[#8a6a33] via-[#d8b478] to-[#ffe8ad]'
                }`}
                style={{ width: `${turnProgress}%` }}
              />
            </div>
          )}
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
                  牌桌动态
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
              {canAct && myPlayer && (
                <div
                  className={`rounded-md border border-[#a98955]/35 bg-[#140d08]/90 px-2 backdrop-blur sm:px-3 ${
                    compactLandscape ? 'mb-1 py-1' : 'mb-1.5 py-1.5'
                  }`}
                >
                  <div className="flex items-center justify-center gap-1.5 sm:justify-end">
                    <span className="hidden font-serif text-[9px] font-semibold tracking-[0.18em] text-[#e7ce97]/50 sm:inline">
                      加注到
                    </span>
                    <button
                      onClick={() =>
                        setRaiseAmount(
                          Math.max(minRaise, raiseValue - raiseStep),
                        )
                      }
                      disabled={actionLoading}
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-white/15 bg-white/5 text-white/70 disabled:opacity-30"
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <input
                      type="number"
                      value={raiseValue}
                      min={Math.min(minRaise, maxRaise)}
                      max={maxRaise}
                      step={raiseStep}
                      onChange={(e) => setRaiseAmount(Number(e.target.value))}
                      onBlur={() =>
                        setRaiseAmount(
                          Math.max(minRaise, Math.min(maxRaise, raiseValue)),
                        )
                      }
                      title={`最低加注 ${minRaise.toLocaleString()}，最高 ${maxRaise.toLocaleString()}`}
                      className="h-7 w-[62px] shrink-0 rounded border border-white/15 bg-black/50 text-center text-sm font-bold text-white outline-none focus:border-[#ff2d6f]/60 sm:w-[78px]"
                    />
                    <button
                      onClick={() =>
                        setRaiseAmount(
                          Math.min(maxRaise, raiseValue + raiseStep),
                        )
                      }
                      disabled={actionLoading}
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-white/15 bg-white/5 text-white/70 disabled:opacity-30"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                    {[
                      ...quickRaisePresets,
                      { label: '最大', value: maxRaise },
                    ].map((preset) => (
                      <button
                        key={preset.label}
                        onClick={() => setRaiseAmount(preset.value)}
                        disabled={actionLoading || !canRaise}
                        title={`加注到 ${preset.value.toLocaleString()}`}
                        className={`h-7 shrink-0 rounded border px-1.5 text-[9px] font-black tracking-[0.02em] transition ${
                          raiseValue === preset.value
                            ? 'border-[#e8cf95]/75 bg-[#e8cf95]/20 text-[#ffe9b8]'
                            : 'border-white/15 bg-white/5 text-white/55 hover:text-white/85'
                        } disabled:opacity-30`}
                      >
                        {preset.label}
                      </button>
                    ))}
                    <button
                      onClick={() => handleAction('allin')}
                      disabled={actionLoading}
                      className="ml-0.5 h-7 shrink-0 rounded border border-[#f3cf5b]/35 bg-[#f3cf5b]/10 px-2 text-[9px] font-black tracking-[0.08em] text-[#f3cf5b] disabled:opacity-30"
                    >
                      全下
                    </button>
                  </div>
                  {!portraitMobile && !compactLandscape && (
                    <div className="mt-1 flex items-center gap-2">
                      <span className="w-[52px] text-right font-mono text-[9px] text-white/35">
                        最低 {minRaise}
                      </span>
                      <input
                        type="range"
                        min={Math.min(minRaise, maxRaise)}
                        max={maxRaise}
                        step={raiseStep}
                        value={raiseValue}
                        disabled={!canRaise || actionLoading}
                        onChange={(e) => setRaiseAmount(Number(e.target.value))}
                        className="h-4 flex-1 cursor-pointer accent-[#d8b478] disabled:opacity-40"
                      />
                      <span className="w-[52px] font-mono text-[9px] text-white/35">
                        最高 {maxRaise}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* 主操作按钮 */}
              {canAct ? (
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
                  弃牌
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
                    ? '过牌'
                    : `跟注 $${callAmount.toLocaleString()}`}
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
                  加注
                </button>
                </div>
              ) : (
                <div className="flex h-[clamp(50px,5.1vw,58px)] items-center justify-between gap-3 rounded-md border border-[#a98955]/35 bg-[#140d08]/90 px-3.5 shadow-[inset_0_1px_0_rgba(255,235,190,.06)] backdrop-blur">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-[#d8b478]/80 shadow-[0_0_8px_rgba(216,180,120,.45)]" />
                    <span className="truncate font-serif text-[clamp(10px,1.1vw,13px)] font-semibold tracking-[0.06em] text-[#e7ce97]/75">
                      {myPlayer?.isFolded
                        ? '你已弃牌，等待本局结束'
                        : turnText}
                    </span>
                  </div>
                  <span
                    className={`shrink-0 rounded-full border px-3 py-1 font-mono text-[clamp(12px,1.05vw,15px)] font-bold tabular-nums ${
                      turnRemaining <= 10
                        ? 'border-red-400/45 bg-red-950/45 text-red-300'
                        : 'border-[#d8b478]/25 bg-black/25 text-[#d8b478]/70'
                    }`}
                  >
                    {turnRemaining > 0 ? `${turnRemaining}秒` : '超时'}
                  </span>
                </div>
              )}
            </div>
          </div>
        </footer>
      )}

      {error && (
        <div className="absolute left-1/2 top-16 z-[80] flex -translate-x-1/2 items-center gap-2 rounded-lg border border-red-400/30 bg-[#260a10]/95 px-3 py-2 text-xs text-red-200 shadow-xl">
          <X className="h-3.5 w-3.5" />
          {error}
        </div>
      )}
    </div>
  );
};

export default GameTablePage;
