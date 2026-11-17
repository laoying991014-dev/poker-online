import { axiosForBackend } from './axios';

import type {
  UserInfo,
  RechargeRecord,
  AdminRechargeRequest,
  RoomInfo,
  GameInfo,
} from '@shared/api.interface';

export async function listUsers(page = 1, pageSize = 20, keyword = ''): Promise<{ items: UserInfo[]; total: number; page: number; pageSize: number }> {
  const response = await axiosForBackend.get(`/api/admin/users?page=${page}&pageSize=${pageSize}&keyword=${encodeURIComponent(keyword)}`);
  return response.data;
}

export async function rechargeUser(body: AdminRechargeRequest): Promise<void> {
  await axiosForBackend.post('/api/admin/recharge', body);
}

export async function listRechargeRecords(page = 1, pageSize = 20): Promise<{ items: RechargeRecord[]; total: number; page: number; pageSize: number }> {
  const response = await axiosForBackend.get(`/api/admin/recharge-records?page=${page}&pageSize=${pageSize}`);
  return response.data;
}

export async function listAllRooms(): Promise<RoomInfo[]> {
  const response = await axiosForBackend.get('/api/admin/rooms');
  return response.data;
}

export async function listGames(roomId: string, page = 1, pageSize = 20): Promise<{ items: GameInfo[]; total: number }> {
  const response = await axiosForBackend.get(`/api/admin/games?roomId=${roomId}&page=${page}&pageSize=${pageSize}`);
  return response.data;
}
