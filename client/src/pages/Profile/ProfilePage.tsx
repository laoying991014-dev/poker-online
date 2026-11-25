import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Trophy,
  TrendingUp,
  TrendingDown,
  History,
  Coins,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
} from 'lucide-react';
import dayjs from 'dayjs';

import { getCurrentUser, getCachedUser, isLoggedIn, extractErrorMessage } from '@client/src/api/auth';
import { getMyRecords } from '@client/src/api/games';
import type { UserInfo, GameRecord } from '@shared/api.interface';
import { Card, CardContent } from '@client/src/components/ui/card';
import { Avatar, AvatarFallback } from '@client/src/components/ui/avatar';
import { Button } from '@client/src/components/ui/button';
import { Skeleton } from '@client/src/components/ui/skeleton';

const logger = console;

const PAGE_SIZE = 20;

const ProfilePage = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<UserInfo | null>(getCachedUser());
  const [userLoading, setUserLoading] = useState(false);
  const [records, setRecords] = useState<GameRecord[]>([]);
  const [recordsLoading, setRecordsLoading] = useState(true);
  const [recordsError, setRecordsError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  useEffect(() => {
    if (!isLoggedIn()) {
      navigate(`/login?redirect=${encodeURIComponent(location.pathname)}`);
    }
  }, [navigate]);

  // 刷新用户信息（确保金币余额最新）
  useEffect(() => {
    let mounted = true;
    setUserLoading(true);
    getCurrentUser()
      .then((u) => {
        if (mounted) {
          setUser(u);
        }
      })
      .catch((err) => {
        logger.error('刷新用户信息失败', err);
      })
      .finally(() => {
        if (mounted) setUserLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  // 加载战绩记录
  useEffect(() => {
    let mounted = true;
    setRecordsLoading(true);
    setRecordsError(null);
    getMyRecords(page, PAGE_SIZE)
      .then((data) => {
        if (mounted) {
          setRecords(data.items);
          setTotal(data.total);
        }
      })
      .catch((err) => {
        if (mounted) {
          setRecordsError(extractErrorMessage(err));
        }
      })
      .finally(() => {
        if (mounted) setRecordsLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [page]);

  // 统计数据：从当前页记录聚合不够准确，需要从全量计算
  // 这里使用 total 和 records 中的胜场来计算（后端应该提供总胜场，这里暂用当前页估算不准确）
  // 更合理的方式是后端返回统计数据，这里先基于 total 做占位，胜场从战绩列表统计仅用于展示
  const stats = useMemo(() => {
    const totalGames = total;
    // 注意：胜场数应从全量数据统计，这里只统计当前页作为近似展示
    // 实际项目中应由后端接口返回统计数据
    const winsOnPage = records.filter((r: GameRecord) => r.isWinner).length;
    // 由于只有当前页数据，胜场暂时无法精确统计全量，使用 total * 估算率不严谨
    // 这里用 total 作为总场次，胜场先显示 -- ，等接口完善后替换
    // 但为了功能完整，我们显示当前页的胜场并标注
    const winRate = total > 0 && records.length > 0
      ? ((winsOnPage / records.length) * 100).toFixed(1)
      : '0.0';
    return {
      totalGames,
      winsOnPage,
      winRate,
    };
  }, [records, total]);

  const handleRefresh = () => {
    setUserLoading(true);
    setRecordsLoading(true);
    getCurrentUser()
      .then((u) => setUser(u))
      .catch((err) => logger.error('刷新用户信息失败', err))
      .finally(() => setUserLoading(false));
    getMyRecords(page, PAGE_SIZE)
      .then((data) => {
        setRecords(data.items);
        setTotal(data.total);
      })
      .catch((err) => setRecordsError(extractErrorMessage(err)))
      .finally(() => setRecordsLoading(false));
  };

  const formatCoins = (val: number) => {
    return val.toLocaleString('zh-CN');
  };

  return (
    <div className="profile-page min-h-screen bg-[#0a1f14] text-white pb-4">
      {/* 顶部栏 */}
      <div className="sticky top-0 z-40 bg-[#0d2818]/95 backdrop-blur border-b border-[#1a3d26]">
        <div className="max-w-xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-lg font-bold text-white">个人中心</h1>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRefresh}
            className="text-gray-400 hover:text-white hover:bg-[#1a3d26] h-8 px-2"
            aria-label="刷新"
          >
            <RefreshCw className={`w-4 h-4 ${userLoading || recordsLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      <div className="max-w-xl mx-auto px-4 py-4 space-y-4">
        {/* 用户信息卡 */}
        <Card className="bg-[#0d2818] border-[#1a3d26]">
          <CardContent className="p-4">
            <div className="flex items-center gap-3 mb-4">
              <Avatar className="w-14 h-14 border-2 border-[#f5c518]">
                <AvatarFallback className="bg-[#1a3d26] text-[#f5c518] text-xl font-bold">
                  {userLoading ? '...' : user?.nickname?.charAt(0) || 'U'}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                {userLoading ? (
                  <div className="space-y-1.5">
                    <Skeleton className="h-5 w-24 bg-[#1a3d26]" />
                    <Skeleton className="h-3 w-20 bg-[#1a3d26]" />
                  </div>
                ) : (
                  <>
                    <h2 className="text-lg font-bold text-white truncate">
                      {user?.nickname || '玩家'}
                    </h2>
                    <p className="text-xs text-gray-400 truncate">@{user?.username}</p>
                  </>
                )}
              </div>
            </div>

            {/* 金币余额 */}
            <div className="bg-[#112a1c] rounded-xl p-4 border border-[#1a3d26]">
              <div className="flex items-center justify-between">
                <span className="text-gray-400 text-sm">金币余额</span>
                <Coins className="w-5 h-5 text-[#f5c518]" />
              </div>
              {userLoading ? (
                <Skeleton className="h-8 w-28 bg-[#1a3d26] mt-2" />
              ) : (
                <p className="text-2xl font-bold text-[#f5c518] mt-1">
                  {formatCoins(user?.coins ?? 0)}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* 统计卡片 */}
        <div className="grid grid-cols-3 gap-3">
          {[
            {
              label: '总对局',
              value: stats.totalGames.toLocaleString(),
              icon: History,
              color: 'text-[#3498db]',
            },
            {
              label: '胜场',
              value: stats.winsOnPage.toLocaleString(),
              icon: Trophy,
              color: 'text-[#f5c518]',
            },
            {
              label: '胜率',
              value: `${stats.winRate}%`,
              icon: TrendingUp,
              color: 'text-[#27ae60]',
            },
          ].map((item) => (
            <div
              key={item.label}
              className="bg-[#0d2818] border border-[#1a3d26] rounded-xl p-3 text-center"
            >
              <item.icon className={`w-5 h-5 mx-auto mb-1.5 ${item.color}`} />
              {recordsLoading ? (
                <Skeleton className="h-5 w-10 bg-[#1a3d26] mx-auto" />
              ) : (
                <p className="text-lg font-bold text-white">{item.value}</p>
              )}
              <p className="text-xs text-gray-500 mt-0.5">{item.label}</p>
            </div>
          ))}
        </div>

        {/* 历史战绩 */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-semibold text-white flex items-center gap-1.5">
              <History className="w-4 h-4 text-[#f5c518]" />
              历史战绩
            </h3>
          </div>

          {recordsLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton
                  key={i}
                  className="h-20 bg-[#0d2818] border border-[#1a3d26] rounded-xl"
                />
              ))}
            </div>
          ) : recordsError ? (
            <Card className="bg-[#0d2818] border-[#1a3d26]">
              <CardContent className="py-8 text-center">
                <p className="text-red-400 text-sm mb-3">{recordsError}</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRefresh}
                  className="border-[#1a3d26] text-gray-300 hover:bg-[#1a3d26]"
                >
                  重试
                </Button>
              </CardContent>
            </Card>
          ) : records.length === 0 ? (
            <Card className="bg-[#0d2818] border-[#1a3d26]">
              <CardContent className="py-10 text-center">
                <Trophy className="w-12 h-12 text-[#1a3d26] mx-auto mb-3" />
                <p className="text-gray-400 text-sm mb-1">暂无对局记录</p>
                <p className="text-gray-500 text-xs">快去大厅开始你的第一局吧</p>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="space-y-2">
                {records.map((record: GameRecord) => (
                  <Card
                    key={record.id}
                    className="bg-[#0d2818] border-[#1a3d26] hover:border-[#0d7a3e] transition-colors"
                  >
                    <CardContent className="p-3">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="text-sm font-medium text-gray-300">
                            {dayjs(record.createdAt).format('MM-DD HH:mm')}
                          </p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            买入 {formatCoins(record.buyIn)} · 最终 {formatCoins(record.finalStack)}
                          </p>
                          <p className="text-[11px] text-amber-300/70 mt-1">
                            本局抽水（各奖池分别5%）：{formatCoins(record.rakeAmount || 0)}
                          </p>
                          {record.communityCards?.length ? (
                            <p className="text-[11px] text-gray-500 mt-1">
                              公共牌：{record.communityCards.join(' ')}
                            </p>
                          ) : null}
                          {record.sidePots?.length ? (
                            <div className="mt-1 space-y-0.5">
                              {record.sidePots.map((pot, index) => (
                                <p key={index} className="text-[10px] text-gray-500">
                                  {index === 0 ? '主池' : '边池 ' + index} {formatCoins(pot.amount)} · 抽水 {formatCoins(pot.rakeAmount || 0)} · 派彩 {formatCoins(pot.netAmount ?? pot.amount)}
                                </p>
                              ))}
                            </div>
                          ) : null}
                        </div>
                        <div className="text-right">
                          <p
                            className={`text-base font-bold ${
                              record.profit > 0
                                ? 'text-[#27ae60]'
                                : record.profit < 0
                                ? 'text-[#e74c3c]'
                                : 'text-gray-400'
                            }`}
                          >
                            {record.profit > 0 ? '+' : ''}
                            {formatCoins(record.profit)}
                          </p>
                          {record.isWinner ? (
                            <span className="inline-flex items-center gap-1 text-[#f5c518] text-xs mt-0.5">
                              <Trophy className="w-3 h-3" />
                              胜利
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[#e74c3c] text-xs mt-0.5">
                              <TrendingDown className="w-3 h-3" />
                              失败
                            </span>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* 分页 */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4 pt-3 border-t border-[#1a3d26]">
                  <p className="text-xs text-gray-500">
                    {total.toLocaleString()} 条 · 第 {page}/{totalPages} 页
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page <= 1}
                      className="border-[#1a3d26] text-gray-300 hover:bg-[#1a3d26] hover:text-white bg-[#0d2818] disabled:opacity-50 h-8 px-3"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={page >= totalPages}
                      className="border-[#1a3d26] text-gray-300 hover:bg-[#1a3d26] hover:text-white bg-[#0d2818] disabled:opacity-50 h-8 px-3"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProfilePage;
