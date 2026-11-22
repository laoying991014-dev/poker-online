import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useEffect, useState, useCallback } from 'react';
import { ArrowLeft, Plus, Minus, RotateCcw } from 'lucide-react';

import { getRoom, leaveRoom, startGame } from '@client/src/api/rooms';
import { getGame, playerAction } from '@client/src/api/games';
import { getCachedUser, isLoggedIn, extractErrorMessage, updateCachedUserCoins } from '@client/src/api/auth';
import { Button } from '@client/src/components/ui/button';
import { Card, CardContent } from '@client/src/components/ui/card';
import { Skeleton } from '@client/src/components/ui/skeleton';
import PokerCard from '@client/src/components/PokerCard';

import type { RoomInfo, GameInfo } from '@shared/api.interface';

const BOT_USER_ID = '11111111-1111-4111-8111-111111111111';

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
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  };

  const handleAction = async (action: 'fold' | 'check' | 'call' | 'raise' | 'allin') => {
    if (!game) return;
    setActionLoading(true);
    try {
      const amount = action === 'raise' ? raiseAmount : undefined;
      const gameData = await playerAction({ gameId: game.id, action, amount });
      setGame(gameData);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setActionLoading(false);
    }
  };

  const currentPlayerSeat = game?.currentPlayerSeat;
  const mySeat = game?.players.find(p => p.userId === currentUser?.id)?.seat;
  const isMyTurn = currentPlayerSeat === mySeat && game?.status !== 'finished';

  const myPlayer = game?.players.find(p => p.userId === currentUser?.id);
  const callAmount = game ? Math.max(0, game.currentBet - (myPlayer?.betAmount || 0)) : 0;
  const minRaise = game ? game.currentBet + (room?.bigBlind || 20) * 2 : 0;
  const myStack = myPlayer?.stack || 0;

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a1f14] p-6">
        <Skeleton className="h-10 w-32 mb-6" />
        <Skeleton className="h-64 w-full rounded-3xl mb-6" />
        <div className="flex gap-4">
          <Skeleton className="h-16 flex-1" />
          <Skeleton className="h-16 flex-1" />
          <Skeleton className="h-16 flex-1" />
        </div>
      </div>
    );
  }

  if (error || !room) {
    return (
      <div className="min-h-screen bg-[#0a1f14] flex items-center justify-center">
        <Card className="bg-[#0d2818] border-[#1a3d26] max-w-md">
          <CardContent className="p-6 text-center">
            <p className="text-red-400 mb-4">{error || '房间不存在'}</p>
            <Button onClick={() => navigate('/lobby')} variant="outline">
              返回大厅
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isHost = room.hostId === currentUser?.id;
  const playerCount = room.players.length;

  return (
    <div className="min-h-screen bg-[#0a1f14] p-3 flex flex-col">
      {/* 顶部栏 */}
      <div className="flex items-center justify-between mb-3">
        <Button variant="ghost" onClick={() => navigate('/lobby')} className="text-gray-300 h-9 px-2">
          <ArrowLeft className="w-4 h-4 mr-1" />
          <span className="text-sm">返回</span>
        </Button>
        <div className="text-center flex-1 px-2">
          <h1 className="text-base font-bold text-white truncate">{room.name}</h1>
          <p className="text-xs text-gray-400">
            <span className="text-[#f5c518] font-mono">{room.roomCode}</span>
            {' · '}
            {room.smallBlind}/{room.bigBlind}
          </p>
        </div>
        <div className="flex gap-1">
          {isHost && room.status === 'waiting' && playerCount >= 2 && (
            <Button
              className="bg-[#f5c518] text-[#0a1f14] hover:bg-[#e0b416] h-9 px-3 text-sm"
              onClick={handleStartGame}
            >
              开始
            </Button>
          )}
          <Button variant="outline" onClick={handleLeave} className="text-red-400 border-red-400/30 h-9 px-2 text-xs">
            离开
          </Button>
        </div>
      </div>

      {/* 牌桌区域 */}
      <div className="flex-1 flex items-center justify-center">
        <div className="relative w-full max-w-2xl aspect-[2/1]">
          {/* 牌桌背景 */}
          <div className="absolute inset-0 rounded-full bg-gradient-to-br from-[#0d7a3e] to-[#0a5c2e] border-8 border-[#3d2817] shadow-2xl">
            <div className="absolute inset-4 rounded-full border-2 border-[#0d7a3e]/50" />
          </div>

          {/* 底池信息 */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center z-10">
            <div className="text-gray-200 text-sm">底池</div>
            <div className="text-[#f5c518] text-2xl font-bold">
              {game?.pot?.toLocaleString() || 0}
            </div>
            {game && game.status !== 'finished' && (
              <div className="text-xs text-gray-300 mt-1">
                {game.round === 'preflop' && '翻牌前'}
                {game.round === 'flop' && '翻牌'}
                {game.round === 'turn' && '转牌'}
                {game.round === 'river' && '河牌'}
                {game.round === 'showdown' && '摊牌'}
              </div>
            )}
          </div>

          {/* 公共牌 */}
          {game && game.communityCards && game.communityCards.length > 0 && (
            <div className="absolute top-[45%] left-1/2 -translate-x-1/2 -translate-y-1/2 flex gap-2 z-10">
              {game.communityCards.map((card, i) => (
                <PokerCard
                  key={i}
                  rank={card[0]}
                  suit={card[1]}
                  size="md"
                />
              ))}
            </div>
          )}

          {/* 玩家座位 - 环形排布 */}
          {room.players.map((player) => {
            const seat = player.seat;
            const totalSeats = room.maxPlayers;
            const angle = (seat / totalSeats) * 360 - 90;
            const radius = 42;
            
            const gamePlayer = game?.players.find(p => p.seat === seat);
            const isCurrentTurn = currentPlayerSeat === seat && game?.status !== 'finished';
            const isMe = player.userId === currentUser?.id;
            const isFolded = gamePlayer?.isFolded;

            const left = 50 + radius * Math.cos(angle * Math.PI / 180);
            const top = 50 + radius * 0.7 * Math.sin(angle * Math.PI / 180);

            return (
              <div
                key={seat}
                className={`absolute -translate-x-1/2 -translate-y-1/2 z-20 ${
                  isCurrentTurn ? 'animate-pulse' : ''
                }`}
                style={{ left: `${left}%`, top: `${top}%` }}
              >
                <div
                  className={`px-3 py-2 rounded-lg text-center min-w-[100px] ${
                    isMe
                      ? 'bg-[#f5c518]/20 border-2 border-[#f5c518]'
                      : isCurrentTurn
                        ? 'bg-[#1a3d26] border-2 border-yellow-400'
                        : 'bg-[#0d2818] border border-[#1a3d26]'
                  } ${isFolded ? 'opacity-40' : ''}`}
                >
                  <div className="text-white text-xs font-medium truncate">
                    {isMe
                      ? '我'
                      : player.userId === BOT_USER_ID
                        ? '电脑人·职业'
                        : `玩家${seat + 1}`}
                  </div>
                  <div className="text-[#f5c518] text-sm font-bold">
                    {player.stack.toLocaleString()}
                  </div>
                  {gamePlayer && gamePlayer.betAmount > 0 && (
                    <div className="text-xs text-gray-300">
                      下注: {gamePlayer.betAmount}
                    </div>
                  )}
                  {isFolded && (
                    <div className="text-xs text-red-400">已弃牌</div>
                  )}
                  {gamePlayer?.isAllIn && (
                    <div className="text-xs text-yellow-400">ALL-IN</div>
                  )}
                </div>

                {/* 玩家手牌（只显示自己的） */}
                {game && gamePlayer && !isFolded && (
                  <div className="flex gap-1 justify-center mt-1">
                    {gamePlayer.holeCards[0] && (
                      isMe || game.status === 'showdown' || game.status === 'finished' ? (
                        <PokerCard
                          rank={gamePlayer.holeCards[0][0]}
                          suit={gamePlayer.holeCards[0][1]}
                          size="sm"
                        />
                      ) : (
                        <PokerCard rank="?" suit="S" faceDown size="sm" />
                      )
                    )}
                    {gamePlayer.holeCards[1] && (
                      isMe || game.status === 'showdown' || game.status === 'finished' ? (
                        <PokerCard
                          rank={gamePlayer.holeCards[1][0]}
                          suit={gamePlayer.holeCards[1][1]}
                          size="sm"
                        />
                      ) : (
                        <PokerCard rank="?" suit="S" faceDown size="sm" />
                      )
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 操作区 */}
      {game && game.status !== 'finished' && myPlayer && !myPlayer.isFolded && (
        <div className="mt-3 flex flex-col items-center gap-2">
          {isMyTurn ? (
            <>
              <div className="text-[#f5c518] text-xs font-medium">轮到你了</div>
              {/* 第一行：弃牌 + 过牌/跟注 + 全下 */}
              <div className="flex gap-2 w-full justify-center">
                <Button
                  variant="destructive"
                  onClick={() => handleAction('fold')}
                  disabled={actionLoading}
                  className="flex-1 max-w-[120px] h-11 text-sm"
                >
                  弃牌
                </Button>

                {callAmount === 0 ? (
                  <Button
                    variant="outline"
                    onClick={() => handleAction('check')}
                    disabled={actionLoading}
                    className="flex-1 max-w-[120px] h-11 text-sm text-blue-400 border-blue-400/30"
                  >
                    过牌
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    onClick={() => handleAction('call')}
                    disabled={actionLoading}
                    className="flex-1 max-w-[120px] h-11 text-sm text-blue-400 border-blue-400/30"
                  >
                    跟注 {callAmount.toLocaleString()}
                  </Button>
                )}

                <Button
                  variant="secondary"
                  onClick={() => handleAction('allin')}
                  disabled={actionLoading}
                  className="flex-1 max-w-[120px] h-11 text-sm bg-yellow-600 hover:bg-yellow-700 text-white"
                >
                  全下
                </Button>
              </div>

              {/* 第二行：加注控制 */}
              <div className="flex items-center gap-2 w-full justify-center mt-1">
                <Button
                  size="icon"
                  variant="outline"
                  onClick={() => setRaiseAmount(Math.max(minRaise, raiseAmount - (room?.bigBlind || 20)))}
                  disabled={actionLoading}
                  className="h-10 w-10 flex-shrink-0"
                >
                  <Minus className="w-4 h-4" />
                </Button>
                <input
                  type="number"
                  value={raiseAmount}
                  onChange={(e) => setRaiseAmount(Number(e.target.value))}
                  className="flex-1 max-w-[120px] h-10 text-center bg-[#0d2818] border border-[#1a3d26] rounded-lg text-white text-base font-medium"
                />
                <Button
                  size="icon"
                  variant="outline"
                  onClick={() => setRaiseAmount(Math.min(myStack, raiseAmount + (room?.bigBlind || 20)))}
                  disabled={actionLoading}
                  className="h-10 w-10 flex-shrink-0"
                >
                  <Plus className="w-4 h-4" />
                </Button>
                <Button
                  onClick={() => handleAction('raise')}
                  disabled={actionLoading || raiseAmount <= game.currentBet}
                  className="h-10 px-4 bg-[#27ae60] hover:bg-[#219a52] text-sm font-semibold"
                >
                  加注
                </Button>
              </div>
            </>
          ) : (
            <div className="text-gray-400 text-xs py-2">等待其他玩家行动...</div>
          )}
        </div>
      )}

      {/* 游戏结束状态 */}
      {game && game.status === 'finished' && (
        <div className="mt-4 text-center">
          <div className="text-xl text-[#f5c518] font-bold mb-2">本局结束</div>
          <div className="text-gray-300">
            赢家: {game.winnerIds.map((id, i) => (
              <span key={i} className="text-[#f5c518]">
                {room.players.find(p => p.userId === id) ? (
                  room.players.find(p => p.userId === id)!.userId === currentUser?.id
                    ? '你'
                    : room.players.find(p => p.userId === id)!.userId === BOT_USER_ID
                      ? '电脑人·职业'
                      : `玩家${room.players.find(p => p.userId === id)!.seat + 1}`
                ) : '未知'}
                {i < game.winnerIds.length - 1 ? '、' : ''}
              </span>
            ))}
          </div>
          <Button
            className="mt-4 bg-[#f5c518] text-[#0a1f14] hover:bg-[#e0b416]"
            onClick={fetchRoom}
          >
            <RotateCcw className="w-4 h-4 mr-2" />
            等待下一局
          </Button>
        </div>
      )}

      {/* 等待状态 */}
      {room.status === 'waiting' && (
        <div className="mt-4 text-center">
          <div className="text-gray-300 mb-2">
            等待玩家加入... ({playerCount}/{room.maxPlayers})
          </div>
          <div className="text-sm text-gray-500">
            {isHost ? '你是房主，人数满足后点击"开始游戏"' : '等待房主开始游戏'}
          </div>
        </div>
      )}
    </div>
  );
};

export default GameTablePage;
