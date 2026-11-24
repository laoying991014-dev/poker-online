import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@client/src/components/ui/button';
import { Input } from '@client/src/components/ui/input';
import { Textarea } from '@client/src/components/ui/textarea';
import { listAdminClubs, createAdminClub, updateAdminClub, listAdminTournaments, createAdminTournament, updateAdminTournament, listComplianceRequests, updateComplianceRequest } from '@client/src/api/admin-operations';

const panel = 'rounded-xl border border-[#6b5136] bg-[#211810] p-4 space-y-3';
const field = 'border-[#6b5136] bg-[#2b2016] text-white placeholder:text-gray-500';
const label = 'block text-xs text-gray-400 mb-1';

export function AdminClubsTab() {
  const qc=useQueryClient(); const [name,setName]=useState(''); const [description,setDescription]=useState('');
  const q=useQuery({queryKey:['admin-clubs'],queryFn:listAdminClubs});
  const create=useMutation({mutationFn:createAdminClub,onSuccess:()=>{toast.success('俱乐部已创建');setName('');setDescription('');qc.invalidateQueries({queryKey:['admin-clubs']});},onError:()=>toast.error('创建失败，请先确认数据库升级 SQL 已执行')});
  const update=useMutation({mutationFn:({id,status}:{id:string;status:string})=>updateAdminClub(id,status),onSuccess:()=>qc.invalidateQueries({queryKey:['admin-clubs']})});
  return <div className="space-y-4">
    <div className={panel}><h3 className="font-semibold text-[#f0d39a]">创建俱乐部</h3>
      <div><label className={label}>俱乐部名称</label><Input className={field} value={name} onChange={e=>setName(e.target.value)} placeholder="输入俱乐部名称"/></div>
      <div><label className={label}>俱乐部介绍</label><Textarea className={field} value={description} onChange={e=>setDescription(e.target.value)}/></div>
      <Button disabled={!name.trim()||create.isPending} onClick={()=>create.mutate({name,description})}>创建俱乐部</Button>
    </div>
    <div className="flex justify-between text-sm text-gray-400"><span>俱乐部列表</span><Button size="sm" variant="outline" onClick={()=>q.refetch()}>刷新</Button></div>
    {q.isLoading?<p>加载中...</p>:q.isError?<p className="text-red-400">加载失败，请检查数据库升级。</p>:q.data?.length?q.data.map((c:any)=><div className={panel} key={c.id}>
      <div className="flex justify-between"><strong>{c.name}</strong><span className="text-xs text-[#f0d39a]">{c.status==='active'?'运营中':'已停用'}</span></div>
      <p className="text-sm text-gray-400">{c.description||'暂无介绍'}</p><p className="text-xs text-gray-500">成员 {c.memberCount} 人</p>
      <Button size="sm" variant="outline" onClick={()=>update.mutate({id:c.id,status:c.status==='active'?'disabled':'active'})}>{c.status==='active'?'停用':'启用'}</Button>
    </div>):<p className="text-gray-500">暂无俱乐部</p>}
  </div>;
}

export function AdminTournamentsTab() {
  const qc=useQueryClient(); const [name,setName]=useState(''); const [entryFee,setEntryFee]=useState('0'); const [prizePool,setPrizePool]=useState('0'); const [maxPlayers,setMaxPlayers]=useState('100'); const [startsAt,setStartsAt]=useState('');
  const q=useQuery({queryKey:['admin-tournaments'],queryFn:listAdminTournaments});
  const create=useMutation({mutationFn:createAdminTournament,onSuccess:()=>{toast.success('锦标赛已创建');setName('');qc.invalidateQueries({queryKey:['admin-tournaments']});},onError:()=>toast.error('创建失败，请检查数据库升级状态和输入')});
  const update=useMutation({mutationFn:({id,status}:{id:string;status:string})=>updateAdminTournament(id,status),onSuccess:()=>qc.invalidateQueries({queryKey:['admin-tournaments']})});
  return <div className="space-y-4">
    <div className={panel}><h3 className="font-semibold text-[#f0d39a]">创建锦标赛</h3><p className="text-xs text-amber-300">报名费与奖励仅为不可兑换、不可提现的虚拟金币。</p>
      <div><label className={label}>赛事名称</label><Input className={field} value={name} onChange={e=>setName(e.target.value)}/></div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div><label className={label}>报名费（虚拟金币）</label><Input className={field} type="number" min="0" value={entryFee} onChange={e=>setEntryFee(e.target.value)}/></div>
        <div><label className={label}>奖励池（虚拟金币）</label><Input className={field} type="number" min="0" value={prizePool} onChange={e=>setPrizePool(e.target.value)}/></div>
        <div><label className={label}>人数上限</label><Input className={field} type="number" min="2" max="10000" value={maxPlayers} onChange={e=>setMaxPlayers(e.target.value)}/></div>
      </div>
      <div><label className={label}>开始时间（可选）</label><Input className={field} type="datetime-local" value={startsAt} onChange={e=>setStartsAt(e.target.value)}/></div>
      <Button disabled={!name.trim()||create.isPending} onClick={()=>create.mutate({name,entryFee:Number(entryFee),prizePool:Number(prizePool),maxPlayers:Number(maxPlayers),startsAt:startsAt?new Date(startsAt).toISOString():undefined,status:startsAt?'scheduled':'draft'})}>创建锦标赛</Button>
    </div>
    <div className="flex justify-between text-sm text-gray-400"><span>赛事列表</span><Button size="sm" variant="outline" onClick={()=>q.refetch()}>刷新</Button></div>
    {q.isLoading?<p>加载中...</p>:q.isError?<p className="text-red-400">加载失败，请检查数据库升级。</p>:q.data?.length?q.data.map((t:any)=><div className={panel} key={t.id}>
      <div className="flex justify-between"><strong>{t.name}</strong><span className="text-xs text-[#f0d39a]">{t.status}</span></div>
      <p className="text-xs text-gray-400">报名 {Number(t.entryFee).toLocaleString()} 金币 · 奖励池 {Number(t.prizePool).toLocaleString()} 金币 · 上限 {t.maxPlayers} 人</p>
      <p className="text-xs text-gray-500">币种：虚拟金币（不可兑换）</p>
      <div className="flex flex-wrap gap-2">{['draft','scheduled','running','finished','cancelled'].map(s=><Button key={s} size="sm" variant={t.status===s?'default':'outline'} onClick={()=>update.mutate({id:t.id,status:s})}>{({draft:'草稿',scheduled:'已排期',running:'进行中',finished:'已结束',cancelled:'取消'} as any)[s]}</Button>)}</div>
    </div>):<p className="text-gray-500">暂无锦标赛</p>}
  </div>;
}

export function AdminRequestsTab() {
  const qc=useQueryClient(); const q=useQuery({queryKey:['admin-compliance-requests'],queryFn:listComplianceRequests}); const [notes,setNotes]=useState<Record<string,string>>({});
  const update=useMutation({mutationFn:({id,status,note}:{id:string;status:string;note:string})=>updateComplianceRequest(id,status,note),onSuccess:()=>{toast.success('申请记录已更新');qc.invalidateQueries({queryKey:['admin-compliance-requests']});},onError:()=>toast.error('更新失败')});
  return <div className="space-y-3"><div className="rounded-lg border border-amber-700/40 bg-amber-950/20 p-3 text-xs text-amber-200">仅用于合规业务申请记录登记与审核；不连接支付渠道、不收集钱包地址、不执行转账，也不处理扑克赢款兑现。</div>
    <div className="flex justify-between text-sm text-gray-400"><span>申请记录</span><Button size="sm" variant="outline" onClick={()=>q.refetch()}>刷新</Button></div>
    {q.isLoading?<p>加载中...</p>:q.isError?<p className="text-red-400">加载失败，请检查数据库升级。</p>:q.data?.length?q.data.map((r:any)=><div className={panel} key={r.id}>
      <div className="flex justify-between"><strong>{r.requestType}</strong><span className="text-xs text-[#f0d39a]">{r.status}</span></div>
      <p className="text-sm text-gray-300">{r.description}</p><p className="text-xs text-gray-500">用户：{r.userId||'未关联'} · 申请说明：{r.amountLabel||'无'} · {new Date(r.createdAt).toLocaleString()}</p>
      <Textarea className={field} placeholder="管理员备注" value={notes[r.id]??r.adminNote??''} onChange={e=>setNotes(v=>({...v,[r.id]:e.target.value}))}/>
      <div className="flex flex-wrap gap-2">{['pending','approved','rejected','closed'].map(s=><Button key={s} size="sm" variant="outline" onClick={()=>update.mutate({id:r.id,status:s,note:notes[r.id]??r.adminNote??''})}>{({pending:'待处理',approved:'审核通过',rejected:'拒绝',closed:'关闭'} as any)[s]}</Button>)}</div>
    </div>):<p className="text-gray-500">暂无申请记录</p>}
  </div>;
}
