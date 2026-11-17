import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Trophy, Crown, Medal, Coins, TrendingUp, Users } from 'lucide-react';

import { isLoggedIn } from '@client/src/api/auth';
import { getCoinRank, getWinRank } from '@client/src/api/rank';
import type { RankUser } from '@shared/api.interface';

const logger = console;
import { Button } from '@client/src/components/ui/button';
import {
  Card,
  CardContent,
} from '@client/src/components/ui/card';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@client/src/components/ui/tabs';
import { Skeleton } from '@client/src/components/ui/skeleton';

function formatNumber(num: number): string {
  return num.toLocaleString('zh-CN');
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) {
    return (
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#f5c518]/20">
        <Crown className="h-5 w-5 text-[#f5c518]" />
      </div>
    );
  }

  if (rank === 2) {
    return (
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#c0c0c0]/20">
        <Medal className="h-5 w-5 text-[#c0c0c0]" />
      </div>
    );
  }

  if (rank === 3) {
    return (
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#cd7f32]/20">
        <Trophy className="h-5 w-5 text-[#cd7f32]" />
      </div>
    );
  }

  return (
    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#1a3d26] text-sm font-semibold text-[#7fb08f]">
      {rank}
    </div>
  );
}

function CoinRankRow({ item }: { item: RankUser }) {
  const isTopThree = item.rank <= 3;

  return (
    <div
      className={`flex items-center gap-3 rounded-xl px-3 py-3 ${
        isTopThree
          ? 'border border-[#f5c518]/30 bg-[#f5c518]/10'
          : 'border border-transparent bg-[#0d2818]/60'
      }`}
    >
      <RankBadge rank={item.rank} />
      <div className="flex-1 truncate text-sm font-medium text-white">
        {item.nickname}
      </div>
      <div className="flex items-center gap-1 text-sm font-semibold text-[#f5c518]">
        <Coins className="h-4 w-4" />
        <span>{formatNumber(item.value)}</span>
      </div>
    </div>
  );
}

function WinRankRow({ item }: { item: RankUser }) {
  const isTopThree = item.rank <= 3;

  return (
    <div
      className={`flex items-center gap-3 rounded-xl px-3 py-3 ${
        isTopThree
          ? 'border border-[#f5c518]/30 bg-[#f5c518]/10'
          : 'border border-transparent bg-[#0d2818]/60'
      }`}
    >
      <RankBadge rank={item.rank} />
      <div className="flex-1 truncate text-sm font-medium text-white">
        {item.nickname}
      </div>
      <div className="flex items-center gap-1 text-sm font-semibold text-[#0d7a3e]">
        <TrendingUp className="h-4 w-4" />
        <span>{formatNumber(item.value)} 胜</span>
      </div>
    </div>
  );
}

function RankSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 10 }).map((_, i) => (
        <Skeleton
          key={i}
          className="h-14 w-full bg-[#0d2818] border border-[#1a3d26] rounded-xl"
        />
      ))}
    </div>
  );
}

function RankEmpty({ text }: { text: string }) {
  return (
    <div className="py-10 text-center">
      <Trophy className="w-10 h-10 text-[#1a3d26] mx-auto mb-3" />
      <p className="text-gray-500 text-sm">{text}</p>
    </div>
  );
}

const RankPage: React.FC = () => {
  const [coinList, setCoinList] = useState<RankUser[]>([]);
  const [winList, setWinList] = useState<RankUser[]>([]);
  const [coinLoading, setCoinLoading] = useState(true);
  const [winLoading, setWinLoading] = useState(true);

  useEffect(() => {
    setCoinLoading(true);
    getCoinRank(20)
      .then((data) => setCoinList(data.items))
      .catch((err) => {
        logger.error('加载金币榜失败', err);
        toast.error('加载金币榜失败');
      })
      .finally(() => setCoinLoading(false));
  }, []);

  useEffect(() => {
    setWinLoading(true);
    getWinRank(20)
      .then((data) => setWinList(data.items))
      .catch((err) => {
        logger.error('加载胜场榜失败', err);
        toast.error('加载胜场榜失败');
      })
      .finally(() => setWinLoading(false));
  }, []);

  const handleSignup = () => {
    if (!isLoggedIn()) {
      toast.error('请先登录再参与排名赛');
      return;
    }
    toast.info('报名功能即将开放，敬请期待');
  };

  return (
    <div
      className="min-h-screen bg-[#0a1f14] px-4 py-6"
      style={{ fontFamily: 'var(--font-sans)' }}
    >
      <div className="mx-auto max-w-xl">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-white">排名赛</h1>
          <p className="mt-1 text-sm text-[#7fb08f]">
            与全服玩家竞技，冲击排行榜
          </p>
        </div>

        <Card className="mb-6 border border-[#1a3d26] bg-[#112a1c] shadow-none">
          <CardContent className="p-5">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-[#f5c518]/15">
                <Trophy className="h-7 w-7 text-[#f5c518]" />
              </div>
              <div className="flex-1">
                <h2 className="text-lg font-bold text-white">每日竞技赛</h2>
                <p className="mt-0.5 text-xs text-[#7fb08f]">
                  每日定时开赛，赢取丰厚金币奖励
                </p>
              </div>
              <Button
                onClick={handleSignup}
                className="shrink-0 rounded-lg bg-[#f5c518] px-5 py-2 text-sm font-semibold text-[#0a1f14] shadow-none hover:bg-[#e0b416] hover:text-[#0a1f14]"
              >
                立即报名
              </Button>
            </div>
            <div className="mt-4 flex items-center justify-between text-xs text-[#5a8a6c]">
              <div className="flex items-center gap-1">
                <Users className="h-3.5 w-3.5" />
                <span>需要登录后参与</span>
              </div>
              <div className="flex items-center gap-1">
                <Coins className="h-3.5 w-3.5 text-[#f5c518]" />
                <span>报名费：500 金币</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border border-[#1a3d26] bg-[#112a1c] shadow-none">
          <CardContent className="p-5">
            <Tabs defaultValue="coins" className="w-full">
              <TabsList className="w-full bg-[#0d2818] p-1">
                <TabsTrigger
                  value="coins"
                  className="flex-1 data-[state=active]:bg-[#1a3d26] data-[state=active]:text-[#f5c518] text-[#7fb08f]"
                >
                  <Coins className="h-4 w-4" />
                  金币榜
                </TabsTrigger>
                <TabsTrigger
                  value="wins"
                  className="flex-1 data-[state=active]:bg-[#1a3d26] data-[state=active]:text-[#f5c518] text-[#7fb08f]"
                >
                  <TrendingUp className="h-4 w-4" />
                  胜场榜
                </TabsTrigger>
              </TabsList>

              <TabsContent value="coins" className="mt-4 space-y-2">
                {coinLoading ? (
                  <RankSkeleton />
                ) : coinList.length === 0 ? (
                  <RankEmpty text="暂无金币排名数据" />
                ) : (
                  coinList.map((item: RankUser) => (
                    <CoinRankRow key={item.userId} item={item} />
                  ))
                )}
              </TabsContent>

              <TabsContent value="wins" className="mt-4 space-y-2">
                {winLoading ? (
                  <RankSkeleton />
                ) : winList.length === 0 ? (
                  <RankEmpty text="暂无胜场排名数据" />
                ) : (
                  winList.map((item: RankUser) => (
                    <WinRankRow key={item.userId} item={item} />
                  ))
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default RankPage;
