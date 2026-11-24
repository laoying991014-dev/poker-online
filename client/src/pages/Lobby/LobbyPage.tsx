import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Coins,
  Zap,
  Users,
  Plus,
  LogIn,
  Clock,
  Loader2,
  AlertTriangle,
  Trophy,
  RefreshCw,
  UserPlus,
} from 'lucide-react';

import {
  listRooms,
  createRoom,
  joinRoom,
  joinMatchQueue,
  leaveMatchQueue,
  getMatchStatus,
} from '@client/src/api/rooms';
import { getCachedUser, isLoggedIn, updateCachedUserCoins, extractErrorMessage } from '@client/src/api/auth';
import type { RoomInfo, UserInfo } from '@shared/api.interface';
import { Button } from '@client/src/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@client/src/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@client/src/components/ui/dialog';
import { Input } from '@client/src/components/ui/input';
import { Label } from '@client/src/components/ui/label';
import { Switch } from '@client/src/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@client/src/components/ui/select';
import { Skeleton } from '@client/src/components/ui/skeleton';

const QUICK_MATCH_SMALL_BLIND = 10;
const QUICK_MATCH_BIG_BLIND = 20;
const QUICK_MATCH_MIN_BUYIN = 200;
const QUICK_MATCH_MAX_BUYIN = 1000;
const QUICK_MATCH_DEFAULT_BUYIN = 500;

const LobbyPage = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [user, setUser] = useState<UserInfo | null>(getCachedUser());

  // 创建房间弹窗
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: '',
    smallBlind: 10,
    bigBlind: 20,
    minBuyin: 200,
    maxBuyin: 1000,
    maxPlayers: '6',
    buyinAmount: 200,
    isPrivate: true,
  });
  const [createErrors, setCreateErrors] = useState<Record<string, string>>({});

  // 加入房间弹窗
  const [joinDialogOpen, setJoinDialogOpen] = useState(false);
  const [joinForm, setJoinForm] = useState({
    roomCode: '',
    buyinAmount: 200,
  });
  const [joinErrors, setJoinErrors] = useState<Record<string, string>>({});

  // 金币是否不足
  const isCoinsInsufficient = useMemo(() => {
    return !user || user.coins <= 0;
  }, [user]);

  // 登录引导弹窗
  const [loginDialogOpen, setLoginDialogOpen] = useState(false);
  const [loginActionText, setLoginActionText] = useState('参与游戏');

  const openLoginDialog = (actionText?: string) => {
    if (actionText) setLoginActionText(actionText);
    setLoginDialogOpen(true);
  };

  // 房间列表轮询
  const {
    data: rooms,
    isLoading: roomsLoading,
    error: roomsError,
    refetch: refetchRooms,
  } = useQuery<RoomInfo[]>({
    queryKey: ['rooms'],
    queryFn: listRooms,
    refetchInterval: 5000,
    refetchIntervalInBackground: false,
  });

  // 公开房间（isPrivate=false, status=waiting）
  const publicRooms = useMemo(() => {
    if (!rooms) return [];
    return rooms.filter((r: RoomInfo) => !r.isPrivate && r.status === 'waiting');
  }, [rooms]);

  // 匹配状态轮询
  const [isMatching, setIsMatching] = useState(false);

  const { data: matchStatus, refetch: refetchMatchStatus } = useQuery({
    queryKey: ['matchStatus'],
    queryFn: getMatchStatus,
    enabled: isMatching,
    refetchInterval: isMatching ? 2000 : false,
  });

  // 匹配成功自动跳转（只在本页主动匹配中生效，避免返回大厅后被旧缓存拉回牌桌）
  useEffect(() => {
    if (!isMatching) return;
    if (matchStatus?.roomId) {
      setIsMatching(false);
      navigate(`/game/${matchStatus.roomId}`);
    }
  }, [isMatching, matchStatus, navigate]);

  // 加入匹配队列 mutation
  const joinMatchMutation = useMutation({
    mutationFn: (buyinAmount: number) => joinMatchQueue(buyinAmount),
    retry: false,
    onSuccess: () => {
      setIsMatching(true);
      toast.success('已加入匹配队列，请等待其他玩家');
    },
    onError: (error: unknown) => {
      toast.error(extractErrorMessage(error));
    },
  });

  // 离开匹配队列 mutation
  const leaveMatchMutation = useMutation({
    mutationFn: () => leaveMatchQueue(),
    retry: false,
    onSuccess: () => {
      setIsMatching(false);
      toast.info('已取消匹配');
    },
    onError: (error: unknown) => {
      toast.error(extractErrorMessage(error));
    },
  });

  // 创建房间 mutation
  const createRoomMutation = useMutation({
    mutationFn: (body: Parameters<typeof createRoom>[0]) => createRoom(body),
    retry: false,
    onSuccess: (data) => {
      const room = data as RoomInfo;
      setCreateDialogOpen(false);
      // 重置表单
      setCreateForm({
        name: '',
        smallBlind: 10,
        bigBlind: 20,
        minBuyin: 200,
        maxBuyin: 1000,
        maxPlayers: '6',
        buyinAmount: 200,
        isPrivate: true,
      });
      setCreateErrors({});
      toast.success(`房间「${room.name}」创建成功`);
      navigate(`/game/${room.id}`);
    },
    onError: (error: unknown) => {
      toast.error(extractErrorMessage(error));
    },
  });

  // 加入房间 mutation
  const joinRoomMutation = useMutation({
    mutationFn: (body: Parameters<typeof joinRoom>[0]) => joinRoom(body),
    retry: false,
    onSuccess: (data) => {
      const room = data as RoomInfo;
      setJoinDialogOpen(false);
      setJoinForm({ roomCode: '', buyinAmount: 200 });
      setJoinErrors({});
      toast.success(`已加入房间「${room.name}」`);
      navigate(`/game/${room.id}`);
    },
    onError: (error: unknown) => {
      toast.error(extractErrorMessage(error));
    },
  });

  // 快速加入公开房间 mutation
  const joinPublicRoomMutation = useMutation({
    mutationFn: (body: Parameters<typeof joinRoom>[0]) => joinRoom(body),
    retry: false,
    onSuccess: (data) => {
      const room = data as RoomInfo;
      toast.success(`已加入房间「${room.name}」`);
      navigate(`/game/${room.id}`);
    },
    onError: (error: unknown) => {
      toast.error(extractErrorMessage(error));
    },
  });

  // 刷新用户金币
  const refreshUserCoins = () => {
    const cached = getCachedUser();
    if (cached) {
      setUser(cached);
    }
  };

  useEffect(() => {
    // 每次房间列表刷新后同步下用户金币
    refreshUserCoins();
  }, [rooms]);

  // 验证创建房间表单
  const validateCreateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!createForm.name.trim()) {
      errors.name = '请输入房间名称';
    }
    if (createForm.smallBlind <= 0 || !Number.isInteger(createForm.smallBlind)) {
      errors.smallBlind = '小盲注必须是正整数';
    }
    if (createForm.bigBlind <= 0 || !Number.isInteger(createForm.bigBlind)) {
      errors.bigBlind = '大盲注必须是正整数';
    }
    if (createForm.bigBlind <= createForm.smallBlind) {
      errors.bigBlind = '大盲注必须大于小盲注';
    }
    if (createForm.minBuyin < createForm.bigBlind * 10) {
      errors.minBuyin = '最小带入不能低于大盲注的10倍';
    }
    if (createForm.maxBuyin < createForm.minBuyin) {
      errors.maxBuyin = '最大带入不能小于最小带入';
    }
    if (!createForm.buyinAmount || createForm.buyinAmount <= 0) {
      errors.buyinAmount = '请输入带入金额';
    }
    if (
      createForm.buyinAmount < createForm.minBuyin ||
      createForm.buyinAmount > createForm.maxBuyin
    ) {
      errors.buyinAmount = `带入金额必须在 ${createForm.minBuyin} - ${createForm.maxBuyin} 之间`;
    }
    if (user && createForm.buyinAmount > user.coins) {
      errors.buyinAmount = '带入金额不能超过您的金币余额';
    }

    setCreateErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // 验证加入房间表单
  const validateJoinForm = (): boolean => {
    const errors: Record<string, string> = {};
    const code = joinForm.roomCode.trim().toUpperCase();

    if (!code) {
      errors.roomCode = '请输入房间码';
    } else if (!/^[A-Z0-9]{6}$/.test(code)) {
      errors.roomCode = '房间码为6位大写字母或数字';
    }
    if (!joinForm.buyinAmount || joinForm.buyinAmount <= 0) {
      errors.buyinAmount = '请输入带入金额';
    }
    if (user && joinForm.buyinAmount > user.coins) {
      errors.buyinAmount = '带入金额不能超过您的金币余额';
    }

    setJoinErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleQuickMatch = () => {
    if (!isLoggedIn()) {
      openLoginDialog('快速匹配');
      return;
    }
    if (isCoinsInsufficient) return;
    if (user && user.coins < QUICK_MATCH_MIN_BUYIN) {
      toast.error(`金币不足，快速匹配最低带入 ${QUICK_MATCH_MIN_BUYIN} 金币`);
      return;
    }
    const buyin = Math.min(
      QUICK_MATCH_DEFAULT_BUYIN,
      user?.coins ?? QUICK_MATCH_DEFAULT_BUYIN,
    );
    joinMatchMutation.mutate(buyin);
  };

  const handleCancelMatch = () => {
    leaveMatchMutation.mutate();
  };

  const handleCreateRoom = () => {
    if (!validateCreateForm()) return;
    createRoomMutation.mutate({
      name: createForm.name.trim(),
      smallBlind: createForm.smallBlind,
      bigBlind: createForm.bigBlind,
      minBuyin: createForm.minBuyin,
      maxBuyin: createForm.maxBuyin,
      maxPlayers: Number(createForm.maxPlayers),
      isPrivate: createForm.isPrivate,
      buyinAmount: createForm.buyinAmount,
    });
  };

  const handleJoinRoom = () => {
    if (!validateJoinForm()) return;
    joinRoomMutation.mutate({
      roomCode: joinForm.roomCode.trim().toUpperCase(),
      buyinAmount: joinForm.buyinAmount,
    });
  };

  const handleJoinPublicRoom = (room: RoomInfo) => {
    if (!isLoggedIn()) {
      openLoginDialog('加入房间');
      return;
    }
    if (isCoinsInsufficient) return;
    const defaultBuyin = Math.min(room.maxBuyin, user?.coins ?? room.minBuyin);
    const buyin = Math.max(room.minBuyin, defaultBuyin);
    if (buyin < room.minBuyin) {
      toast.error(`金币不足，该房间最低带入 ${room.minBuyin} 金币`);
      return;
    }
    joinPublicRoomMutation.mutate({
      roomCode: room.roomCode,
      buyinAmount: buyin,
    });
  };

  const canJoinRoom = (room: RoomInfo): boolean => {
    if (!user || user.coins < room.minBuyin) return false;
    if (room.players.length >= room.maxPlayers) return false;
    return true;
  };

  return (
    <div className="lobby-page min-h-screen bg-[#0a1f14] text-white">
      {/* 顶部栏 */}
      <header className="sticky top-0 z-40 border-b border-[#1a3d26] bg-[#0d2818]/95 backdrop-blur">
        <div className="w-full px-1 py-2 flex items-center justify-between">
          <h1 className="text-lg font-bold text-[#f5c518]">游戏大厅</h1>
          <div className="flex items-center gap-2">
            {!isLoggedIn() ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate(`/login?redirect=${encodeURIComponent(location.pathname)}`)}
                  className="border-[#1a3d26] text-gray-300 hover:bg-[#1a3d26] hover:text-white h-8 px-3 text-xs"
                >
                  登录
                </Button>
                <Button
                  size="sm"
                  onClick={() => navigate(`/register?redirect=${encodeURIComponent(location.pathname)}`)}
                  className="bg-[#f5c518] text-[#0a1f14] font-semibold hover:bg-[#e0b416] h-8 px-3 text-xs"
                >
                  注册
                </Button>
              </>
            ) : isCoinsInsufficient ? (
              <div className="flex items-center gap-1 text-[#e74c3c] text-xs">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>金币不足</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 bg-[#112a1c] border border-[#1a3d26] rounded-lg px-3 py-1.5">
                <Coins className="w-4 h-4 text-[#f5c518]" />
                <span className="text-[#f5c518] font-bold text-sm">
                  {user?.coins?.toLocaleString() || 0}
                </span>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="w-full max-w-none mx-auto px-1 py-3 space-y-7">
        {/* 两大操作区块 */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {/* 快速匹配 */}
          <Card className="hidden bg-[#0d2818] border-[#1a3d26] hover:border-[#0d7a3e] transition-colors">
            <CardHeader className="pb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-[#f5c518]/20 flex items-center justify-center">
                  <Zap className="w-6 h-6 text-[#f5c518]" />
                </div>
                <div>
                  <CardTitle className="text-xl text-white">快速匹配</CardTitle>
                  <CardDescription className="text-gray-400 mt-1">
                    系统自动匹配在线玩家，人数满足后立即开局
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2 text-gray-300">
                    <span className="text-gray-500">盲注：</span>
                    <span>
                      小盲 {QUICK_MATCH_SMALL_BLIND} / 大盲 {QUICK_MATCH_BIG_BLIND}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-gray-300">
                    <span className="text-gray-500">带入：</span>
                    <span>
                      {QUICK_MATCH_MIN_BUYIN.toLocaleString()} -{' '}
                      {QUICK_MATCH_MAX_BUYIN.toLocaleString()}
                    </span>
                  </div>
                </div>
                {isMatching ? (
                  <div className="flex flex-col items-end gap-2">
                    <div className="flex items-center gap-2 text-[#f5c518]">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span className="text-sm font-medium">正在匹配中...</span>
                    </div>
                    {matchStatus?.waitingCount !== undefined && (
                      <div className="flex items-center gap-1 text-xs text-gray-400">
                        <Users className="w-3 h-3" />
                        <span>等待人数：{matchStatus.waitingCount}</span>
                      </div>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCancelMatch}
                      disabled={leaveMatchMutation.isPending}
                      className="border-[#1a3d26] text-gray-300 hover:bg-[#1a3d26] hover:text-white mt-1"
                    >
                      {leaveMatchMutation.isPending ? (
                        <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                      ) : null}
                      取消匹配
                    </Button>
                  </div>
                ) : (
                  <Button
                    size="lg"
                    onClick={handleQuickMatch}
                    disabled={
                      (isLoggedIn() && isCoinsInsufficient) || joinMatchMutation.isPending
                    }
                    title={isLoggedIn() && isCoinsInsufficient ? '金币不足，请先充值' : ''}
                    className="bg-[#f5c518] text-[#0a1f14] font-bold hover:bg-[#e0b416] min-w-[140px]"
                  >
                    {joinMatchMutation.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        加入中...
                      </>
                    ) : (
                      <>
                        <Zap className="w-4 h-4" />
                        开始匹配
                      </>
                    )}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* 好友组局 */}
          <Card className="hidden bg-[#0d2818] border-[#1a3d26] hover:border-[#0d7a3e] transition-colors">
            <CardHeader className="pb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-[#0d7a3e]/20 flex items-center justify-center">
                  <Users className="w-6 h-6 text-[#0d7a3e]" />
                </div>
                <div>
                  <CardTitle className="text-xl text-white">私人房间</CardTitle>
                  <CardDescription className="text-gray-400 mt-1">
                    创建自己的牌桌，可选择公开展示或仅凭房间号加入
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
                <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
                  <Button
                    size="lg"
                    disabled={isLoggedIn() && isCoinsInsufficient}
                    title={isLoggedIn() && isCoinsInsufficient ? '金币不足，请先充值' : ''}
                    className="flex-1 bg-[#0d7a3e] hover:bg-[#0a5c2e] text-white font-semibold"
                    onClick={() => {
                      if (!isLoggedIn()) {
                        openLoginDialog('创建房间');
                        return;
                      }
                      setCreateDialogOpen(true);
                    }}
                  >
                    <Plus className="w-4 h-4" />
                    创建牌桌
                  </Button>
                  <DialogContent className="bg-[#0d2818] border-[#1a3d26] text-white max-w-lg">
                    <DialogHeader>
                      <DialogTitle className="text-[#f5c518] text-xl">
                        创建牌桌
                      </DialogTitle>
                      <DialogDescription className="text-gray-400">
                        设置房间参数，创建后可邀请好友加入
                      </DialogDescription>
                    </DialogHeader>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-4">
                      <div className="sm:col-span-2 space-y-2">
                        <Label htmlFor="room-name" className="text-gray-300">
                          房间名称
                        </Label>
                        <Input
                          id="room-name"
                          value={createForm.name}
                          onChange={(e) =>
                            setCreateForm({ ...createForm, name: e.target.value })
                          }
                          placeholder="给房间起个名字"
                          className="border-[#1a3d26] bg-[#0a1f14] text-white focus:border-[#f5c518]"
                        />
                        {createErrors.name && (
                          <p className="text-xs text-[#e74c3c]">{createErrors.name}</p>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="small-blind" className="text-gray-300">
                          小盲注
                        </Label>
                        <Input
                          id="small-blind"
                          type="number"
                          min={1}
                          value={createForm.smallBlind}
                          onChange={(e) =>
                            setCreateForm({
                              ...createForm,
                              smallBlind: Number(e.target.value) || 0,
                            })
                          }
                          className="border-[#1a3d26] bg-[#0a1f14] text-white focus:border-[#f5c518]"
                        />
                        {createErrors.smallBlind && (
                          <p className="text-xs text-[#e74c3c]">
                            {createErrors.smallBlind}
                          </p>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="big-blind" className="text-gray-300">
                          大盲注
                        </Label>
                        <Input
                          id="big-blind"
                          type="number"
                          min={1}
                          value={createForm.bigBlind}
                          onChange={(e) =>
                            setCreateForm({
                              ...createForm,
                              bigBlind: Number(e.target.value) || 0,
                            })
                          }
                          className="border-[#1a3d26] bg-[#0a1f14] text-white focus:border-[#f5c518]"
                        />
                        {createErrors.bigBlind && (
                          <p className="text-xs text-[#e74c3c]">
                            {createErrors.bigBlind}
                          </p>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="min-buyin" className="text-gray-300">
                          最小带入
                        </Label>
                        <Input
                          id="min-buyin"
                          type="number"
                          min={0}
                          value={createForm.minBuyin}
                          onChange={(e) =>
                            setCreateForm({
                              ...createForm,
                              minBuyin: Number(e.target.value) || 0,
                            })
                          }
                          className="border-[#1a3d26] bg-[#0a1f14] text-white focus:border-[#f5c518]"
                        />
                        {createErrors.minBuyin && (
                          <p className="text-xs text-[#e74c3c]">
                            {createErrors.minBuyin}
                          </p>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="max-buyin" className="text-gray-300">
                          最大带入
                        </Label>
                        <Input
                          id="max-buyin"
                          type="number"
                          min={0}
                          value={createForm.maxBuyin}
                          onChange={(e) =>
                            setCreateForm({
                              ...createForm,
                              maxBuyin: Number(e.target.value) || 0,
                            })
                          }
                          className="border-[#1a3d26] bg-[#0a1f14] text-white focus:border-[#f5c518]"
                        />
                        {createErrors.maxBuyin && (
                          <p className="text-xs text-[#e74c3c]">
                            {createErrors.maxBuyin}
                          </p>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="max-players" className="text-gray-300">
                          最大人数
                        </Label>
                        <Select
                          value={createForm.maxPlayers}
                          onValueChange={(val) =>
                            setCreateForm({ ...createForm, maxPlayers: val })
                          }
                        >
                          <SelectTrigger
                            id="max-players"
                            className="w-full border-[#1a3d26] bg-[#0a1f14] text-white"
                          >
                            <SelectValue placeholder="选择人数" />
                          </SelectTrigger>
                          <SelectContent className="bg-[#0d2818] border-[#1a3d26] text-white">
                            {[2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                              <SelectItem key={n} value={String(n)}>
                                {n} 人
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="buyin-amount" className="text-gray-300">
                          带入金额
                        </Label>
                        <Input
                          id="buyin-amount"
                          type="number"
                          min={0}
                          value={createForm.buyinAmount}
                          onChange={(e) =>
                            setCreateForm({
                              ...createForm,
                              buyinAmount: Number(e.target.value) || 0,
                            })
                          }
                          className="border-[#1a3d26] bg-[#0a1f14] text-white focus:border-[#f5c518]"
                        />
                        {createErrors.buyinAmount && (
                          <p className="text-xs text-[#e74c3c]">
                            {createErrors.buyinAmount}
                          </p>
                        )}
                        <p className="text-xs text-gray-500">
                          可用金币：{user?.coins?.toLocaleString() || 0}
                        </p>
                      </div>

                      <div className="sm:col-span-2 flex items-center justify-between py-2 px-3 bg-[#0a1f14] rounded-lg border border-[#1a3d26]">
                        <div>
                          <p className="text-sm text-white">私人房间</p>
                          <p className="text-xs text-gray-500">
                            开启后仅持有房间码的玩家可加入
                          </p>
                        </div>
                        <Switch
                          checked={createForm.isPrivate}
                          onCheckedChange={(checked) =>
                            setCreateForm({ ...createForm, isPrivate: checked })
                          }
                        />
                      </div>
                    </div>

                    <DialogFooter>
                      <Button
                        variant="outline"
                        onClick={() => setCreateDialogOpen(false)}
                        className="border-[#1a3d26] text-gray-300 hover:bg-[#1a3d26] hover:text-white"
                      >
                        取消
                      </Button>
                      <Button
                        onClick={handleCreateRoom}
                        disabled={createRoomMutation.isPending}
                        className="bg-[#f5c518] text-[#0a1f14] font-bold hover:bg-[#e0b416]"
                      >
                        {createRoomMutation.isPending ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            创建中...
                          </>
                        ) : (
                          '创建房间'
                        )}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>

                <Dialog open={joinDialogOpen} onOpenChange={setJoinDialogOpen}>
                  <Button
                    size="lg"
                    variant="outline"
                    className="flex-1 border-[#1a3d26] text-white hover:bg-[#1a3d26] hover:text-white"
                    onClick={() => {
                      if (!isLoggedIn()) {
                        openLoginDialog('加入房间');
                        return;
                      }
                      setJoinDialogOpen(true);
                    }}
                  >
                    <LogIn className="w-4 h-4" />
                    加入房间
                  </Button>
                  <DialogContent className="bg-[#0d2818] border-[#1a3d26] text-white max-w-md">
                    <DialogHeader>
                      <DialogTitle className="text-[#f5c518] text-xl">
                        加入房间
                      </DialogTitle>
                      <DialogDescription className="text-gray-400">
                        输入6位房间码加入好友的牌局
                      </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label htmlFor="room-code" className="text-gray-300">
                          房间码
                        </Label>
                        <Input
                          id="room-code"
                          value={joinForm.roomCode}
                          onChange={(e) =>
                            setJoinForm({
                              ...joinForm,
                              roomCode: e.target.value.toUpperCase(),
                            })
                          }
                          placeholder="6位房间码"
                          maxLength={6}
                          className="border-[#1a3d26] bg-[#0a1f14] text-white focus:border-[#f5c518] tracking-widest text-center text-lg font-mono uppercase"
                        />
                        {joinErrors.roomCode && (
                          <p className="text-xs text-[#e74c3c]">
                            {joinErrors.roomCode}
                          </p>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="join-buyin" className="text-gray-300">
                          带入金额
                        </Label>
                        <Input
                          id="join-buyin"
                          type="number"
                          min={0}
                          value={joinForm.buyinAmount}
                          onChange={(e) =>
                            setJoinForm({
                              ...joinForm,
                              buyinAmount: Number(e.target.value) || 0,
                            })
                          }
                          className="border-[#1a3d26] bg-[#0a1f14] text-white focus:border-[#f5c518]"
                        />
                        {joinErrors.buyinAmount && (
                          <p className="text-xs text-[#e74c3c]">
                            {joinErrors.buyinAmount}
                          </p>
                        )}
                        <p className="text-xs text-gray-500">
                          可用金币：{user?.coins?.toLocaleString() || 0}
                        </p>
                      </div>
                    </div>

                    <DialogFooter>
                      <Button
                        variant="outline"
                        onClick={() => setJoinDialogOpen(false)}
                        className="border-[#1a3d26] text-gray-300 hover:bg-[#1a3d26] hover:text-white"
                      >
                        取消
                      </Button>
                      <Button
                        onClick={handleJoinRoom}
                        disabled={
                          (isLoggedIn() && isCoinsInsufficient) || joinRoomMutation.isPending
                        }
                        title={isLoggedIn() && isCoinsInsufficient ? '金币不足，请先充值' : ''}
                        className="bg-[#f5c518] text-[#0a1f14] font-bold hover:bg-[#e0b416]"
                      >
                        {joinRoomMutation.isPending ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            加入中...
                          </>
                        ) : (
                          '加入房间'
                        )}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </CardContent>
          </Card>
        </div>

          <Card className="relative overflow-hidden border-[#b58a50]/30 bg-gradient-to-br from-[#261b12] to-[#130e09] opacity-90">
            <CardContent className="flex h-full min-h-[160px] items-center justify-between gap-4 p-5">
              <div>
                <div className="mb-2 flex items-center gap-2 text-[#f0d39a]">
                  <Trophy className="h-5 w-5" />
                  <span className="text-xs font-semibold tracking-[.22em]">TOURNAMENT</span>
                </div>
                <h3 className="text-xl font-bold text-white">锦标赛</h3>
                <p className="mt-2 max-w-[220px] text-sm leading-relaxed text-[#b5a48a]">单桌与多桌赛事正在筹备，开放后会在这里显示报名信息。</p>
              </div>
              <span className="shrink-0 rounded-full border border-[#b58a50]/35 bg-[#3a2918] px-3 py-1.5 text-[11px] font-semibold tracking-wider text-[#d9b477]">暂未开放</span>
            </CardContent>
          </Card>
        </div>

        {/* 公开现金桌 */}

        <section className="rounded-2xl border border-[#b58a50]/25 bg-gradient-to-br from-[#2b2016]/90 to-[#15100b]/95 p-4 md:p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Trophy className="w-5 h-5 text-[#f5c518]" />
              <h2 className="text-xl font-bold text-white">公开现金桌</h2>
              <span className="text-sm text-gray-500">
                ({publicRooms.length} 张可加入)
              </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => refetchRooms()}
              className="text-gray-400 hover:text-white hover:bg-[#1a3d26]"
              aria-label="刷新房间列表"
            >
              <RefreshCw className="w-4 h-4 mr-1" />
              刷新
            </Button>
          </div>

          {roomsLoading ? (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton
                  key={i}
                  className="h-28 bg-[#112a1c] border border-[#1a3d26] rounded-xl"
                />
              ))}
            </div>
          ) : roomsError ? (
            <Card className="bg-[#0d2818] border-[#1a3d26]">
              <CardContent className="py-8 text-center">
                <p className="text-[#e74c3c] mb-2">加载房间列表失败</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => refetchRooms()}
                  className="border-[#1a3d26] text-gray-300 hover:bg-[#1a3d26] hover:text-white"
                >
                  重新加载
                </Button>
              </CardContent>
            </Card>
          ) : publicRooms.length === 0 ? (
            <Card className="bg-[#0d2818] border-[#1a3d26]">
              <CardContent className="py-12 text-center">
                <div className="w-16 h-16 rounded-full bg-[#1a3d26] flex items-center justify-center mx-auto mb-4">
                  <Users className="w-8 h-8 text-gray-600" />
                </div>
                <p className="text-gray-400 mb-1">暂无公开房间</p>
                <p className="text-sm text-gray-600">
                  创建一个房间或使用快速匹配开始游戏
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {publicRooms.map((room: RoomInfo) => {
                const canJoin = canJoinRoom(room);
                const isFull = room.players.length >= room.maxPlayers;
                return (
                  <Card
                    key={room.id}
                    className="bg-[#0d2818] border-[#1a3d26] hover:border-[#0d7a3e] transition-colors"
                  >
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base text-white truncate">
                        {room.name}
                      </CardTitle>
                      <CardDescription className="text-gray-500 text-xs flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        等待中
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-500">盲注</span>
                        <span className="text-gray-300">
                          {room.smallBlind} / {room.bigBlind}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-500">玩家</span>
                        <span
                          className={
                            isFull ? 'text-[#e74c3c]' : 'text-gray-300'
                          }
                        >
                          {room.players.length} / {room.maxPlayers}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-500">带入</span>
                        <span className="text-gray-300">
                          {room.minBuyin.toLocaleString()} -{' '}
                          {room.maxBuyin.toLocaleString()}
                        </span>
                      </div>
                      <Button
                        size="sm"
                        className="w-full bg-[#0d7a3e] hover:bg-[#0a5c2e] text-white mt-2"
                        disabled={(isLoggedIn() && !canJoin) || joinPublicRoomMutation.isPending}
                        title={
                          isLoggedIn() && !canJoin && isCoinsInsufficient
                            ? '金币不足，请先充值'
                            : isFull
                              ? '房间已满'
                              : ''
                        }
                        onClick={() => handleJoinPublicRoom(room)}
                      >
                        {isFull
                          ? '房间已满'
                          : joinPublicRoomMutation.isPending
                            ? '加入中...'
                            : '立即加入'}
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </section>

        {/* 玩法介绍 */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-5 h-5 rounded bg-[#f5c518]/20 flex items-center justify-center">
              <Zap className="w-3 h-3 text-[#f5c518]" />
            </div>
            <h2 className="text-lg font-bold text-white">玩法介绍</h2>
          </div>

          <div className="space-y-3">
            <Card className="bg-[#0d2818] border-[#1a3d26]">
              <CardContent className="p-4 space-y-2">
                <h3 className="text-[#f5c518] font-semibold text-sm">基本规则</h3>
                <p className="text-xs text-gray-400 leading-relaxed">
                  德州扑克使用52张牌，每位玩家发2张底牌，配合5张公共牌组成最大牌型。
                  牌型从大到小：皇家同花顺 &gt; 同花顺 &gt; 四条 &gt; 葫芦 &gt; 同花 &gt; 顺子 &gt; 三条 &gt; 两对 &gt; 一对 &gt; 高牌。
                </p>
              </CardContent>
            </Card>

            <Card className="bg-[#0d2818] border-[#1a3d26]">
              <CardContent className="p-4 space-y-2">
                <h3 className="text-[#f5c518] font-semibold text-sm">游戏流程</h3>
                <div className="space-y-1.5 text-xs text-gray-400">
                  <p>1. 小盲/大盲强制下注，首轮发2张底牌</p>
                  <p>2. 翻牌前：可弃牌/跟注/加注</p>
                  <p>3. 翻牌（3张公共牌）→ 第二轮下注</p>
                  <p>4. 转牌（第4张）→ 第三轮下注</p>
                  <p>5. 河牌（第5张）→ 第四轮下注</p>
                  <p>6. 摊牌比牌，最大牌型者赢取底池</p>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-[#0d2818] border-[#1a3d26]">
              <CardContent className="p-4 space-y-2">
                <h3 className="text-[#f5c518] font-semibold text-sm">操作说明</h3>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-gray-500"></span>
                    <span className="text-gray-400">弃牌：放弃本局</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-[#3498db]"></span>
                    <span className="text-gray-400">跟注：跟上注额</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-[#27ae60]"></span>
                    <span className="text-gray-400">加注：提高注额</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-[#f5c518]"></span>
                    <span className="text-gray-400">全下：押上全部</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* 登录引导弹窗 */}
        <Dialog open={loginDialogOpen} onOpenChange={setLoginDialogOpen}>
          <DialogContent className="bg-[#0d2818] border-[#1a3d26] text-white max-w-md">
            <DialogHeader>
              <DialogTitle className="text-[#f5c518] text-xl">
                需要登录
              </DialogTitle>
              <DialogDescription className="text-gray-400">
                {loginActionText} 前请先登录或注册账号。登录后即可使用完整游戏功能。
              </DialogDescription>
            </DialogHeader>

            <div className="py-6 space-y-3">
              <Button
                className="w-full bg-[#f5c518] text-[#0a1f14] font-bold hover:bg-[#e0b416]"
                onClick={() => {
                  setLoginDialogOpen(false);
                  navigate(`/login?redirect=${encodeURIComponent(location.pathname)}`);
                }}
              >
                <LogIn className="w-4 h-4 mr-2" />
                登录账号
              </Button>
              <Button
                variant="outline"
                className="w-full border-[#1a3d26] text-gray-300 hover:bg-[#1a3d26] hover:text-white"
                onClick={() => {
                  setLoginDialogOpen(false);
                  navigate(`/register?redirect=${encodeURIComponent(location.pathname)}`);
                }}
              >
                <UserPlus className="w-4 h-4 mr-2" />
                注册新账号
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

export default LobbyPage;
