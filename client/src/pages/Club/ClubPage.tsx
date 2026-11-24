import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { CalendarClock, Club, RefreshCw, Spade, Users } from 'lucide-react';

import { isLoggedIn } from '@client/src/api/auth';
import { listMyRooms } from '@client/src/api/rooms';
import { listPublicClubs, type PublicClub } from '@client/src/api/clubs';
import type { RoomInfo } from '@shared/api.interface';
import { Button } from '@client/src/components/ui/button';
import { Card, CardContent } from '@client/src/components/ui/card';
import { Skeleton } from '@client/src/components/ui/skeleton';

function getNextClubStart(club: PublicClub, now: Date): Date | null {
  if (club.scheduleType === 'once') {
    if (!club.startsAt) return null;
    return new Date(club.startsAt);
  }
  if (club.scheduleType === 'daily' && club.dailyStartTime) {
    const [hours, minutes] = club.dailyStartTime.split(':').map(Number);
    const next = new Date(now);
    next.setHours(hours, minutes, 0, 0);
    if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
    return next;
  }
  return null;
}

function countdownText(target: Date | null, now: Date): string {
  if (!target || Number.isNaN(target.getTime())) return '开赛时间待安排';
  const diff = target.getTime() - now.getTime();
  if (diff <= 0) return '已到开赛时间';
  const seconds = Math.floor(diff / 1000);
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return days > 0 ? `距离开赛 ${days}天 ${hours}小时` : `距离开赛 ${hours}小时 ${minutes}分 ${secs}秒`;
}

function scheduleLabel(club: PublicClub): string {
  if (club.scheduleType === 'daily' && club.dailyStartTime) return `每天 ${club.dailyStartTime} 开赛（当地时间）`;
  if (club.scheduleType === 'once' && club.startsAt) return `指定开赛：${new Date(club.startsAt).toLocaleString()}`;
  return '开赛时间待安排';
}

const ClubPage: React.FC = () => {
  const navigate = useNavigate();
  const loggedIn = isLoggedIn();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const clubsQuery = useQuery<PublicClub[]>({
    queryKey: ['public-clubs'],
    queryFn: listPublicClubs,
    refetchInterval: 30000,
  });
  const {
    data: myRooms = [],
    isLoading,
    isError,
    refetch,
  } = useQuery<RoomInfo[]>({
    queryKey: ['myRooms'],
    queryFn: listMyRooms,
    enabled: loggedIn,
    refetchInterval: loggedIn ? 8000 : false,
    refetchIntervalInBackground: false,
  });

  const visibleMyRooms = myRooms.filter((room) => room.name.trim() !== '快速匹配');

  return (
    <div className="mx-auto min-h-[70vh] max-w-5xl space-y-6 px-1 py-3">
      <header className="rounded-2xl border border-[#b58a50]/30 bg-gradient-to-br from-[#2b2016] to-[#15100b] p-5">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#d9b477]/15">
            <Club className="h-6 w-6 text-[#f0d39a]" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">俱乐部</h1>
            <p className="mt-1 text-sm text-[#b5a48a]">查看俱乐部开赛安排和你的牌桌</p>
          </div>
        </div>
      </header>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5 text-[#f0d39a]" />
            <h2 className="text-lg font-bold text-white">俱乐部开赛安排</h2>
            <span className="text-xs text-[#b5a48a]">({clubsQuery.data?.length ?? 0})</span>
          </div>
          <Button variant="ghost" size="sm" onClick={() => void clubsQuery.refetch()} className="text-[#b5a48a] hover:bg-[#2b2016] hover:text-white">
            <RefreshCw className="mr-1 h-4 w-4" />刷新
          </Button>
        </div>
        {clubsQuery.isLoading ? (
          <div className="grid gap-3 md:grid-cols-2"><Skeleton className="h-32 rounded-xl border border-[#6b5136] bg-[#211810]" /><Skeleton className="h-32 rounded-xl border border-[#6b5136] bg-[#211810]" /></div>
        ) : clubsQuery.isError ? (
          <Card className="border-[#6b5136] bg-[#211810]"><CardContent className="p-5 text-center text-sm text-red-300">暂时无法加载俱乐部，请稍后刷新。</CardContent></Card>
        ) : clubsQuery.data?.length ? (
          <div className="grid gap-3 md:grid-cols-2">
            {clubsQuery.data.map((club) => {
              const nextStart = getNextClubStart(club, now);
              return (
                <Card key={club.id} className="border-[#6b5136] bg-[#211810]">
                  <CardContent className="space-y-2 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate font-semibold text-white">{club.name}</p>
                      <span className="shrink-0 text-xs text-[#f0d39a]">{club.memberCount} 位成员</span>
                    </div>
                    <p className="text-sm text-[#a99577]">{club.description || '暂无俱乐部介绍'}</p>
                    <p className="text-xs text-[#b5a48a]">{scheduleLabel(club)}</p>
                    <div className="rounded-lg bg-[#2b2016] px-3 py-2 text-sm font-semibold text-[#f0d39a]">{countdownText(nextStart, now)}</div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <Card className="border-[#6b5136] bg-[#211810]"><CardContent className="p-6 text-center text-sm text-[#b5a48a]">目前没有开放的俱乐部</CardContent></Card>
        )}
      </section>

      {!loggedIn ? (
        <Card className="border-[#6b5136] bg-[#211810]">
          <CardContent className="space-y-4 p-7 text-center">
            <Users className="mx-auto h-10 w-10 text-[#d9b477]" />
            <p className="text-sm text-[#b5a48a]">登录后查看你所在的牌桌</p>
            <Button onClick={() => navigate('/login?redirect=%2Fclub')} className="bg-[#d9b477] font-semibold text-[#20160d] hover:bg-[#edc786]">登录</Button>
          </CardContent>
        </Card>
      ) : (
        <section className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Spade className="h-5 w-5 text-[#f0d39a]" />
              <h2 className="text-lg font-bold text-white">我的牌桌</h2>
              <span className="text-xs text-[#b5a48a]">({visibleMyRooms.length})</span>
            </div>
            <Button variant="ghost" size="sm" onClick={() => void refetch()} className="text-[#b5a48a] hover:bg-[#2b2016] hover:text-white"><RefreshCw className="mr-1 h-4 w-4" />刷新</Button>
          </div>
          {isLoading ? (
            <div className="grid gap-3 md:grid-cols-2"><Skeleton className="h-28 rounded-xl border border-[#6b5136] bg-[#211810]" /><Skeleton className="h-28 rounded-xl border border-[#6b5136] bg-[#211810]" /></div>
          ) : isError ? (
            <Card className="border-[#6b5136] bg-[#211810]"><CardContent className="space-y-3 p-6 text-center"><p className="text-sm text-red-300">暂时无法加载你的牌桌</p><Button variant="outline" onClick={() => void refetch()} className="border-[#6b5136] text-[#f0d39a] hover:bg-[#2b2016]">重试</Button></CardContent></Card>
          ) : visibleMyRooms.length === 0 ? (
            <Card className="border-[#6b5136] bg-[#211810]"><CardContent className="p-8 text-center"><Users className="mx-auto mb-3 h-10 w-10 text-[#6b5136]" /><p className="text-sm text-[#b5a48a]">目前没有你所在的牌桌</p><Button onClick={() => navigate('/lobby')} className="mt-4 bg-[#d9b477] text-[#20160d] hover:bg-[#edc786]">前往游戏大厅</Button></CardContent></Card>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {visibleMyRooms.map((room) => (
                <Card key={room.id} className="border-[#6b5136] bg-[#211810]">
                  <CardContent className="flex items-center justify-between gap-3 p-4">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-white">{room.name}</p>
                      <p className="mt-1 text-xs text-[#b5a48a]">{room.status === 'playing' ? '正在进行' : '等待开局'} · 盲注 {room.smallBlind}/{room.bigBlind}</p>
                      <p className="mt-1 text-[11px] text-[#8d7c65]">房间号 {room.roomCode} · {room.players.length}/{room.maxPlayers} 人 · {room.isPrivate ? '私人房间' : '公开房间'}</p>
                    </div>
                    <Button size="sm" onClick={() => navigate(`/game/${room.id}`)} className="shrink-0 bg-[#d9b477] text-[#20160d] hover:bg-[#edc786]">{room.status === 'playing' ? '继续游戏' : '进入房间'}</Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
};

export default ClubPage;
