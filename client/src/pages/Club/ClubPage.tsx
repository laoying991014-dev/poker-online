import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Club, RefreshCw, Spade, Users } from 'lucide-react';

import { isLoggedIn } from '@client/src/api/auth';
import { listMyRooms } from '@client/src/api/rooms';
import type { RoomInfo } from '@shared/api.interface';
import { Button } from '@client/src/components/ui/button';
import { Card, CardContent } from '@client/src/components/ui/card';
import { Skeleton } from '@client/src/components/ui/skeleton';

const ClubPage: React.FC = () => {
  const navigate = useNavigate();
  const loggedIn = isLoggedIn();
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

  // 俱乐部只显示普通牌桌，隐藏系统自动创建的快速匹配房间
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
            <p className="mt-1 text-sm text-[#b5a48a]">回到你的牌桌，继续和好友一起游戏</p>
          </div>
        </div>
      </header>

      {!loggedIn ? (
        <Card className="border-[#6b5136] bg-[#211810]">
          <CardContent className="space-y-4 p-7 text-center">
            <Users className="mx-auto h-10 w-10 text-[#d9b477]" />
            <p className="text-sm text-[#b5a48a]">登录后查看你所在的俱乐部牌桌</p>
            <Button
              onClick={() => navigate('/login?redirect=%2Fclub')}
              className="bg-[#d9b477] font-semibold text-[#20160d] hover:bg-[#edc786]"
            >
              登录
            </Button>
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
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void refetch()}
              className="text-[#b5a48a] hover:bg-[#2b2016] hover:text-white"
            >
              <RefreshCw className="mr-1 h-4 w-4" />
              刷新
            </Button>
          </div>

          {isLoading ? (
            <div className="grid gap-3 md:grid-cols-2">
              <Skeleton className="h-28 rounded-xl border border-[#6b5136] bg-[#211810]" />
              <Skeleton className="h-28 rounded-xl border border-[#6b5136] bg-[#211810]" />
            </div>
          ) : isError ? (
            <Card className="border-[#6b5136] bg-[#211810]">
              <CardContent className="space-y-3 p-6 text-center">
                <p className="text-sm text-red-300">暂时无法加载你的牌桌</p>
                <Button
                  variant="outline"
                  onClick={() => void refetch()}
                  className="border-[#6b5136] text-[#f0d39a] hover:bg-[#2b2016]"
                >
                  重试
                </Button>
              </CardContent>
            </Card>
          ) : visibleMyRooms.length === 0 ? (
            <Card className="border-[#6b5136] bg-[#211810]">
              <CardContent className="p-8 text-center">
                <Users className="mx-auto mb-3 h-10 w-10 text-[#6b5136]" />
                <p className="text-sm text-[#b5a48a]">目前没有你所在的牌桌</p>
                <Button
                  onClick={() => navigate('/lobby')}
                  className="mt-4 bg-[#d9b477] text-[#20160d] hover:bg-[#edc786]"
                >
                  前往游戏大厅
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {visibleMyRooms.map((room) => (
                <Card key={room.id} className="border-[#6b5136] bg-[#211810]">
                  <CardContent className="flex items-center justify-between gap-3 p-4">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-white">{room.name}</p>
                      <p className="mt-1 text-xs text-[#b5a48a]">
                        {room.status === 'playing' ? '正在进行' : '等待开局'}
                        {' · '}盲注 {room.smallBlind}/{room.bigBlind}
                      </p>
                      <p className="mt-1 text-[11px] text-[#8d7c65]">
                        房间号 {room.roomCode} · {room.players.length}/{room.maxPlayers} 人
                        {' · '}{room.isPrivate ? '私人房间' : '公开房间'}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => navigate(`/game/${room.id}`)}
                      className="shrink-0 bg-[#d9b477] text-[#20160d] hover:bg-[#edc786]"
                    >
                      {room.status === 'playing' ? '继续游戏' : '进入房间'}
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>
      )}

      <Card className="border-[#6b5136]/70 bg-[#211810]/60">
        <CardContent className="p-5">
          <h2 className="font-semibold text-[#f0d39a]">俱乐部空间</h2>
          <p className="mt-2 text-sm leading-relaxed text-[#a99577]">
            你可以从这里继续进入已经加入的牌桌。俱乐部创建、成员管理和邀请功能尚未接入，不会显示虚假的已开通俱乐部数据。
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default ClubPage;
