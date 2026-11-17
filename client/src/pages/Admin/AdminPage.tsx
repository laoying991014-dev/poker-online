import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Search,
  Coins,
  UserCog,
  History,
  LayoutGrid,
  Plus,
  Minus,
  Lock,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react';

import {
  listUsers,
  rechargeUser,
  listRechargeRecords,
  listAllRooms,
} from '@client/src/api/admin';
import { getCachedUser, isLoggedIn } from '@client/src/api/auth';
import { getApiErrorMessage } from '@client/src/lib/api-error';
import type { UserInfo, RechargeRecord, RoomInfo } from '@shared/api.interface';
import {
  ROOM_STATUS_LABELS,
  type RoomStatus,
} from '@shared/api.interface';

import { Tabs, TabsList, TabsTrigger, TabsContent } from '@client/src/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@client/src/components/ui/card';
import { Button } from '@client/src/components/ui/button';
import { Input } from '@client/src/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@client/src/components/ui/dialog';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@client/src/components/ui/table';
import { Badge } from '@client/src/components/ui/badge';
import { Skeleton } from '@client/src/components/ui/skeleton';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationPrevious,
  PaginationNext,
  PaginationEllipsis,
} from '@client/src/components/ui/pagination';

const PAGE_SIZE = 10;

function formatNumber(n: number): string {
  return n.toLocaleString('zh-CN');
}

function formatDate(s: string): string {
  if (!s) return '-';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
}

function getPaginationPages(current: number, totalPages: number): (number | '...')[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const pages: (number | '...')[] = [1];
  if (current > 3) pages.push('...');
  const start = Math.max(2, current - 1);
  const end = Math.min(totalPages - 1, current + 1);
  for (let i = start; i <= end; i++) pages.push(i);
  if (current < totalPages - 2) pages.push('...');
  pages.push(totalPages);
  return pages;
}

/* ==========================  骨架屏  ========================== */

function UserSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-4 rounded-lg border border-[#1a3d26] bg-[#0d2818] p-4"
        >
          <Skeleton className="h-10 w-10 rounded-full bg-[#1a3d26]" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-24 bg-[#1a3d26]" />
            <Skeleton className="h-3 w-16 bg-[#1a3d26]" />
          </div>
          <Skeleton className="h-4 w-20 bg-[#1a3d26]" />
          <Skeleton className="h-6 w-16 rounded-md bg-[#1a3d26]" />
          <Skeleton className="h-8 w-16 rounded-md bg-[#1a3d26]" />
        </div>
      ))}
    </div>
  );
}

function RecordSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-4 rounded-md border border-[#1a3d26] bg-[#0d2818] px-4 py-3"
        >
          <Skeleton className="h-4 w-36 bg-[#1a3d26]" />
          <Skeleton className="h-4 w-24 bg-[#1a3d26]" />
          <Skeleton className="h-4 w-20 bg-[#1a3d26]" />
          <Skeleton className="h-4 w-16 bg-[#1a3d26]" />
          <Skeleton className="h-4 w-40 flex-1 bg-[#1a3d26]" />
        </div>
      ))}
    </div>
  );
}

function RoomSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="rounded-xl border border-[#1a3d26] bg-[#0d2818] p-5"
        >
          <Skeleton className="mb-3 h-5 w-32 bg-[#1a3d26]" />
          <Skeleton className="mb-4 h-4 w-24 bg-[#1a3d26]" />
          <div className="space-y-2">
            <Skeleton className="h-3 w-full bg-[#1a3d26]" />
            <Skeleton className="h-3 w-3/4 bg-[#1a3d26]" />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ==========================  状态徽章  ========================== */

function RoomStatusBadge({ status }: { status: RoomStatus }) {
  const colors: Record<RoomStatus, string> = {
    waiting:
      'bg-[#1a3d26] text-[#f5c518] border border-[#f5c518]/30',
    playing:
      'bg-[#0d7a3e]/20 text-[#27ae60] border border-[#27ae60]/30',
    finished:
      'bg-[#1a3d26] text-gray-400 border border-gray-600/30',
  };
  return (
    <Badge className={colors[status]} variant="outline">
      {ROOM_STATUS_LABELS[status]}
    </Badge>
  );
}

/* ==========================  充值弹窗  ========================== */

interface RechargeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: UserInfo | null;
}

function RechargeDialog({ open, onOpenChange, user }: RechargeDialogProps) {
  const queryClient = useQueryClient();
  const [amountText, setAmountText] = useState('');
  const [remark, setRemark] = useState('');

  const amountNum = Number(amountText);
  const validAmount =
    amountText !== '' &&
    !Number.isNaN(amountNum) &&
    Number.isFinite(amountNum) &&
    amountNum !== 0;

  const { mutate, isPending } = useMutation({
    mutationFn: (body: { userId: string; amount: number; remark?: string }) =>
      rechargeUser(body),
    retry: false,
    onSuccess: () => {
      toast.success('充值操作已提交');
      setAmountText('');
      setRemark('');
      onOpenChange(false);
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      queryClient.invalidateQueries({ queryKey: ['admin-recharge-records'] });
    },
    onError: (error) => {
      toast.error(getApiErrorMessage(error, '充值失败，请稍后重试'));
    },
  });

  const handleSubmit = () => {
    if (!user || !validAmount) return;
    mutate({
      userId: user.id,
      amount: amountNum,
      remark: remark.trim() || undefined,
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!isPending) onOpenChange(v);
      }}
    >
      <DialogContent className="border-[#1a3d26] bg-[#0d2818] text-white sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white">金币充值 / 扣除</DialogTitle>
          <DialogDescription className="text-gray-400">
            正数充值，负数扣除
          </DialogDescription>
        </DialogHeader>

        {user && (
          <div className="space-y-4">
            <div className="rounded-lg border border-[#1a3d26] bg-[#112a1c] p-4">
              <div className="text-sm text-gray-400">目标用户</div>
              <div className="mt-1 text-lg font-medium">{user.nickname}</div>
              <div className="text-xs text-gray-500">@{user.username}</div>
              <div className="mt-3 flex items-center gap-2">
                <Coins className="h-4 w-4 text-[#f5c518]" />
                <span className="text-[#f5c518] font-semibold">
                  当前金币：{formatNumber(user.coins)}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm text-gray-300">调整金额</label>
              <div className="relative">
                <Input
                  type="number"
                  value={amountText}
                  onChange={(e) => setAmountText(e.target.value)}
                  placeholder="输入金额，正数充值，负数扣除"
                  className={`border-[#1a3d26] bg-[#112a1c] text-white placeholder:text-gray-500 focus-visible:ring-[#0d7a3e] ${
                    amountText !== '' && validAmount && amountNum < 0
                      ? 'text-[#e74c3c]'
                      : amountText !== '' && validAmount
                      ? 'text-[#27ae60]'
                      : ''
                  }`}
                />
                <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center gap-1">
                  {validAmount && amountNum > 0 && (
                    <Plus className="h-4 w-4 text-[#27ae60]" />
                  )}
                  {validAmount && amountNum < 0 && (
                    <Minus className="h-4 w-4 text-[#e74c3c]" />
                  )}
                </div>
              </div>
              {amountText !== '' && !validAmount && (
                <p className="text-xs text-[#e74c3c]">请输入有效金额（不能为 0）</p>
              )}
              {validAmount && (
                <p className="text-xs text-gray-400">
                  操作后金币：
                  <span
                    className={
                      user.coins + amountNum < 0 ? 'text-[#e74c3c]' : 'text-[#f5c518]'
                    }
                  >
                    {' '}
                    {formatNumber(user.coins + amountNum)}
                  </span>
                </p>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-sm text-gray-300">备注（可选）</label>
              <Input
                value={remark}
                onChange={(e) => setRemark(e.target.value)}
                placeholder="充值原因或说明"
                className="border-[#1a3d26] bg-[#112a1c] text-white placeholder:text-gray-500 focus-visible:ring-[#0d7a3e]"
                maxLength={100}
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button
            variant="ghost"
            className="text-gray-300 hover:bg-[#1a3d26] hover:text-white"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            取消
          </Button>
          <Button
            disabled={!validAmount || isPending}
            className="border-[#f5c518]/30 bg-[#f5c518] text-[#0a1f14] hover:bg-[#d4a80a]"
            onClick={handleSubmit}
          >
            {isPending ? '提交中...' : '确认充值'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ==========================  无权限  ========================== */

function NoPermission() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#e74c3c]/10">
        <AlertTriangle className="h-8 w-8 text-[#e74c3c]" />
      </div>
      <h2 className="mb-2 text-xl font-semibold text-white">无权限访问</h2>
      <p className="text-gray-400">仅管理员可访问管理后台</p>
    </div>
  );
}

/* ==========================  用户管理 Tab  ========================== */

function UserManagementTab() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [rechargeUserInfo, setRechargeUserInfo] = useState<UserInfo | null>(null);
  const [rechargeOpen, setRechargeOpen] = useState(false);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['admin-users', page, keyword],
    queryFn: () => listUsers(page, PAGE_SIZE, keyword),
  });

  const totalPages = useMemo(
    () => (data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1),
    [data],
  );

  const handleSearch = () => {
    setKeyword(searchInput.trim());
    setPage(1);
  };

  const handleRecharge = (u: UserInfo) => {
    setRechargeUserInfo(u);
    setRechargeOpen(true);
  };

  if (isError) {
    const status =
      error && typeof error === 'object' && 'response' in error
        ? (error as { response?: { status?: number } }).response?.status
        : undefined;
    if (status === 403) return <NoPermission />;
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <p className="mb-4 text-[#e74c3c]">
          {getApiErrorMessage(error, '加载用户列表失败')}
        </p>
        <Button
          variant="outline"
          size="sm"
          className="border-[#1a3d26] text-white hover:bg-[#1a3d26]"
          onClick={() => refetch()}
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          重试
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 搜索栏 */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 items-center gap-2">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSearch();
              }}
              placeholder="搜索用户名或昵称"
              className="border-[#1a3d26] bg-[#0d2818] pl-10 text-white placeholder:text-gray-500 focus-visible:ring-[#0d7a3e]"
            />
          </div>
          <Button
            className="border-[#0d7a3e]/30 bg-[#0d7a3e] text-white hover:bg-[#0a5c2e]"
            onClick={handleSearch}
          >
            <Search className="h-4 w-4" />
            搜索
          </Button>
        </div>
        <div className="text-sm text-gray-400">
          {isLoading || !data
            ? '加载中...'
            : `共 ${data.total} 位用户`}
        </div>
      </div>

      {isLoading ? (
        <UserSkeleton />
      ) : (
        <>
          <div className="overflow-x-auto overflow-hidden rounded-xl border border-[#1a3d26] bg-[#0d2818]">
            <Table>
              <TableHeader className="bg-[#112a1c]">
                <TableRow className="border-[#1a3d26] hover:bg-transparent">
                  <TableHead className="text-gray-300">用户名</TableHead>
                  <TableHead className="text-gray-300">昵称</TableHead>
                  <TableHead className="text-gray-300">金币余额</TableHead>
                  <TableHead className="text-gray-300">管理员</TableHead>
                  <TableHead className="text-gray-300">注册时间</TableHead>
                  <TableHead className="text-right text-gray-300">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.items.length === 0 ? (
                  <TableRow className="border-[#1a3d26] hover:bg-transparent">
                    <TableCell colSpan={6} className="py-12 text-center text-gray-500">
                      暂无用户
                    </TableCell>
                  </TableRow>
                ) : (
                  data?.items.map((u: UserInfo) => (
                    <TableRow
                      key={u.id}
                      className="border-[#1a3d26] hover:bg-[#112a1c]/50"
                    >
                      <TableCell className="font-mono text-gray-200">
                        {u.username}
                      </TableCell>
                      <TableCell className="text-white">{u.nickname}</TableCell>
                      <TableCell>
                        <span className="flex items-center gap-1 font-semibold text-[#f5c518]">
                          <Coins className="h-4 w-4" />
                          {formatNumber(u.coins)}
                        </span>
                      </TableCell>
                      <TableCell>
                        {u.isAdmin ? (
                          <Badge className="border-[#f5c518]/30 bg-[#f5c518]/10 text-[#f5c518]">
                            管理员
                          </Badge>
                        ) : (
                          <span className="text-gray-500">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-gray-400">
                        {formatDate(u.createdAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-[#f5c518]/30 text-[#f5c518] hover:bg-[#f5c518]/10"
                          onClick={() => handleRecharge(u)}
                        >
                          <Coins className="h-3.5 w-3.5" />
                          充值
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* 分页 */}
          {data && data.total > PAGE_SIZE && (
            <Pagination className="mt-4">
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      if (page > 1) setPage(page - 1);
                    }}
                    className={
                      page === 1
                        ? 'pointer-events-none opacity-50 text-gray-500 hover:text-gray-500 hover:bg-transparent'
                        : 'border-[#1a3d26] text-gray-300 hover:bg-[#1a3d26] hover:text-white'
                    }
                  />
                </PaginationItem>
                {getPaginationPages(page, totalPages).map((p, i) =>
                  p === '...' ? (
                    <PaginationItem key={`e-${i}`}>
                      <PaginationEllipsis className="text-gray-500" />
                    </PaginationItem>
                  ) : (
                    <PaginationItem key={p}>
                      <PaginationLink
                        href="#"
                        isActive={p === page}
                        onClick={(e) => {
                          e.preventDefault();
                          setPage(p);
                        }}
                        className={
                          p === page
                            ? 'border-[#f5c518]/30 bg-[#f5c518] text-[#0a1f14] hover:bg-[#d4a80a]'
                            : 'border-[#1a3d26] text-gray-300 hover:bg-[#1a3d26] hover:text-white'
                        }
                      >
                        {p}
                      </PaginationLink>
                    </PaginationItem>
                  ),
                )}
                <PaginationItem>
                  <PaginationNext
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      if (page < totalPages) setPage(page + 1);
                    }}
                    className={
                      page === totalPages
                        ? 'pointer-events-none opacity-50 text-gray-500 hover:text-gray-500 hover:bg-transparent'
                        : 'border-[#1a3d26] text-gray-300 hover:bg-[#1a3d26] hover:text-white'
                    }
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          )}
        </>
      )}

      <RechargeDialog
        open={rechargeOpen}
        onOpenChange={setRechargeOpen}
        user={rechargeUserInfo}
      />
    </div>
  );
}

/* ==========================  充值记录 Tab  ========================== */

function RechargeRecordsTab() {
  const [page, setPage] = useState(1);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['admin-recharge-records', page],
    queryFn: () => listRechargeRecords(page, PAGE_SIZE),
  });

  const totalPages = useMemo(
    () => (data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1),
    [data],
  );

  if (isError) {
    const status =
      error && typeof error === 'object' && 'response' in error
        ? (error as { response?: { status?: number } }).response?.status
        : undefined;
    if (status === 403) return <NoPermission />;
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <p className="mb-4 text-[#e74c3c]">
          {getApiErrorMessage(error, '加载充值记录失败')}
        </p>
        <Button
          variant="outline"
          size="sm"
          className="border-[#1a3d26] text-white hover:bg-[#1a3d26]"
          onClick={() => refetch()}
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          重试
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-400">
          {isLoading || !data
            ? '加载中...'
            : `共 ${data.total} 条记录`}
        </div>
        <Button
          variant="outline"
          size="sm"
          className="border-[#1a3d26] text-white hover:bg-[#1a3d26]"
          onClick={() => refetch()}
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          刷新
        </Button>
      </div>

      {isLoading ? (
        <RecordSkeleton />
      ) : (
        <>
          <div className="overflow-x-auto overflow-hidden rounded-xl border border-[#1a3d26] bg-[#0d2818]">
            <Table>
              <TableHeader className="bg-[#112a1c]">
                <TableRow className="border-[#1a3d26] hover:bg-transparent">
                  <TableHead className="text-gray-300">时间</TableHead>
                  <TableHead className="text-gray-300">管理员ID</TableHead>
                  <TableHead className="text-gray-300">用户</TableHead>
                  <TableHead className="text-gray-300">金额</TableHead>
                  <TableHead className="text-gray-300">备注</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.items.length === 0 ? (
                  <TableRow className="border-[#1a3d26] hover:bg-transparent">
                    <TableCell colSpan={5} className="py-12 text-center text-gray-500">
                      暂无充值记录
                    </TableCell>
                  </TableRow>
                ) : (
                  data?.items.map((r: RechargeRecord) => (
                    <TableRow
                      key={r.id}
                      className="border-[#1a3d26] hover:bg-[#112a1c]/50"
                    >
                      <TableCell className="text-gray-400">
                        {formatDate(r.createdAt)}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-gray-400">
                        {r.adminId.slice(0, 8)}...
                      </TableCell>
                      <TableCell className="font-mono text-xs text-gray-300">
                        {r.userId.slice(0, 8)}...
                      </TableCell>
                      <TableCell>
                        <span
                          className={
                            r.amount >= 0
                              ? 'font-semibold text-[#27ae60]'
                              : 'font-semibold text-[#e74c3c]'
                          }
                        >
                          {r.amount >= 0 ? '+' : ''}
                          {formatNumber(r.amount)}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-xs truncate text-gray-400">
                        {r.remark || '—'}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {data && data.total > PAGE_SIZE && (
            <Pagination className="mt-4">
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      if (page > 1) setPage(page - 1);
                    }}
                    className={
                      page === 1
                        ? 'pointer-events-none opacity-50 text-gray-500 hover:text-gray-500 hover:bg-transparent'
                        : 'border-[#1a3d26] text-gray-300 hover:bg-[#1a3d26] hover:text-white'
                    }
                  />
                </PaginationItem>
                {getPaginationPages(page, totalPages).map((p, i) =>
                  p === '...' ? (
                    <PaginationItem key={`e-${i}`}>
                      <PaginationEllipsis className="text-gray-500" />
                    </PaginationItem>
                  ) : (
                    <PaginationItem key={p}>
                      <PaginationLink
                        href="#"
                        isActive={p === page}
                        onClick={(e) => {
                          e.preventDefault();
                          setPage(p);
                        }}
                        className={
                          p === page
                            ? 'border-[#f5c518]/30 bg-[#f5c518] text-[#0a1f14] hover:bg-[#d4a80a]'
                            : 'border-[#1a3d26] text-gray-300 hover:bg-[#1a3d26] hover:text-white'
                        }
                      >
                        {p}
                      </PaginationLink>
                    </PaginationItem>
                  ),
                )}
                <PaginationItem>
                  <PaginationNext
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      if (page < totalPages) setPage(page + 1);
                    }}
                    className={
                      page === totalPages
                        ? 'pointer-events-none opacity-50 text-gray-500 hover:text-gray-500 hover:bg-transparent'
                        : 'border-[#1a3d26] text-gray-300 hover:bg-[#1a3d26] hover:text-white'
                    }
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          )}
        </>
      )}
    </div>
  );
}

/* ==========================  房间管理 Tab  ========================== */

function RoomManagementTab() {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['admin-rooms'],
    queryFn: () => listAllRooms(),
  });

  const sortedRooms = useMemo(() => {
    if (!data) return [];
    return [...data].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }, [data]);

  if (isError) {
    const status =
      error && typeof error === 'object' && 'response' in error
        ? (error as { response?: { status?: number } }).response?.status
        : undefined;
    if (status === 403) return <NoPermission />;
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <p className="mb-4 text-[#e74c3c]">
          {getApiErrorMessage(error, '加载房间列表失败')}
        </p>
        <Button
          variant="outline"
          size="sm"
          className="border-[#1a3d26] text-white hover:bg-[#1a3d26]"
          onClick={() => refetch()}
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          重试
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-400">
          {isLoading || !data ? '加载中...' : `共 ${data.length} 个房间`}
        </div>
        <Button
          variant="outline"
          size="sm"
          className="border-[#1a3d26] text-white hover:bg-[#1a3d26]"
          onClick={() => refetch()}
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          刷新
        </Button>
      </div>

      {isLoading ? (
        <RoomSkeleton />
      ) : sortedRooms.length === 0 ? (
        <div className="rounded-xl border border-[#1a3d26] bg-[#0d2818] py-16 text-center text-gray-500">
          暂无房间
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {sortedRooms.map((room: RoomInfo) => {
            const playerCount = room.players?.filter(
              (p) => p.isActive,
            ).length ?? 0;
            return (
              <Card
                key={room.id}
                className="border-[#1a3d26] bg-[#0d2818] hover:border-[#0d7a3e]/50 transition-colors"
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-base text-white">
                      {room.name}
                    </CardTitle>
                    <RoomStatusBadge status={room.status} />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm text-[#f5c518]">
                      #{room.roomCode}
                    </span>
                    {room.isPrivate && (
                      <Badge
                        variant="outline"
                        className="border-gray-600/30 bg-gray-700/20 text-gray-400"
                      >
                        <Lock className="mr-1 h-3 w-3" />
                        私人
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-400">盲注</span>
                    <span className="text-white">
                      {formatNumber(room.smallBlind)} /{' '}
                      {formatNumber(room.bigBlind)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">玩家</span>
                    <span className="text-white">
                      {playerCount} / {room.maxPlayers}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">带入</span>
                    <span className="text-white">
                      {formatNumber(room.minBuyin)} -{' '}
                      {formatNumber(room.maxBuyin)}
                    </span>
                  </div>
                  <div className="pt-2 text-xs text-gray-500">
                    创建于 {formatDate(room.createdAt)}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ==========================  主页面  ========================== */

export default function AdminPage() {
  const navigate = useNavigate();
  const cachedUser = getCachedUser();

  useEffect(() => {
    if (!isLoggedIn()) {
      navigate(`/login?redirect=${encodeURIComponent(location.pathname)}`);
    }
  }, [navigate]);

  if (!isLoggedIn()) {
    return null;
  }

  if (!cachedUser?.isAdmin) {
    return (
      <div className="min-h-screen bg-[#0a1f14] flex items-center justify-center text-white p-6">
        <div className="text-center">
          <Lock className="w-16 h-16 mx-auto mb-4 text-[#e74c3c]" />
          <h2 className="text-xl font-bold mb-2">无访问权限</h2>
          <p className="text-gray-400 mb-6">您的账号不是管理员账号</p>
          <Button onClick={() => navigate('/lobby')}>返回大厅</Button>
        </div>
      </div>
    );
  }
  return (
    <div className="min-h-screen bg-[#0a1f14] p-3 md:p-6 text-white">
      <div className="mx-auto max-w-7xl">
        {/* 页面标题 */}
        <div className="mb-4 md:mb-6">
          <h1 className="mb-1 text-xl md:text-2xl font-bold text-[#f5c518]">管理后台</h1>
          <p className="text-xs md:text-sm text-gray-400">
            用户管理、金币充值、房间状态监控
          </p>
        </div>

        <Card className="border-[#1a3d26] bg-[#0d2818]">
          <CardContent className="p-0">
            <Tabs defaultValue="users" className="w-full">
              <div className="border-b border-[#1a3d26] px-3 md:px-6 pt-3 md:pt-4 overflow-x-auto">
                <TabsList className="h-auto gap-0.5 md:gap-1 bg-transparent p-0 min-w-max">
                  <TabsTrigger
                    value="users"
                    className="h-9 md:h-10 gap-1.5 md:gap-2 rounded-b-none border-b-2 border-transparent px-3 md:px-4 py-2 text-xs md:text-sm data-[state=active]:border-[#f5c518] data-[state=active]:bg-transparent data-[state=active]:text-[#f5c518] data-[state=active]:shadow-none text-gray-400 hover:text-white whitespace-nowrap"
                  >
                    <UserCog className="h-3.5 w-3.5 md:h-4 md:w-4" />
                    用户管理
                  </TabsTrigger>
                  <TabsTrigger
                    value="records"
                    className="h-9 md:h-10 gap-1.5 md:gap-2 rounded-b-none border-b-2 border-transparent px-3 md:px-4 py-2 text-xs md:text-sm data-[state=active]:border-[#f5c518] data-[state=active]:bg-transparent data-[state=active]:text-[#f5c518] data-[state=active]:shadow-none text-gray-400 hover:text-white whitespace-nowrap"
                  >
                    <History className="h-3.5 w-3.5 md:h-4 md:w-4" />
                    充值记录
                  </TabsTrigger>
                  <TabsTrigger
                    value="rooms"
                    className="h-9 md:h-10 gap-1.5 md:gap-2 rounded-b-none border-b-2 border-transparent px-3 md:px-4 py-2 text-xs md:text-sm data-[state=active]:border-[#f5c518] data-[state=active]:bg-transparent data-[state=active]:text-[#f5c518] data-[state=active]:shadow-none text-gray-400 hover:text-white whitespace-nowrap"
                  >
                    <LayoutGrid className="h-3.5 w-3.5 md:h-4 md:w-4" />
                    房间管理
                  </TabsTrigger>
                </TabsList>
              </div>

              <div className="p-3 md:p-6">
                <TabsContent value="users" className="mt-0">
                  <UserManagementTab />
                </TabsContent>
                <TabsContent value="records" className="mt-0">
                  <RechargeRecordsTab />
                </TabsContent>
                <TabsContent value="rooms" className="mt-0">
                  <RoomManagementTab />
                </TabsContent>
              </div>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
