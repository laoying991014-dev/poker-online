import { axiosForBackend } from './axios';

import type {
  RoomInfo,
  CreateRoomRequest,
  JoinRoomRequest,
} from '@shared/api.interface';

export async function listRooms(): Promise<RoomInfo[]> {
  const response = await axiosForBackend.get('/api/rooms');
  return response.data;
}

export async function listMyRooms(): Promise<RoomInfo[]> {
  const response = await axiosForBackend.get('/api/rooms/mine');
  return response.data;
}

export async function getRoom(roomId: string): Promise<RoomInfo> {
  const response = await axiosForBackend.get(`/api/rooms/${roomId}`);
  return response.data;
}

export async function createRoom(body: CreateRoomRequest): Promise<RoomInfo> {
  const response = await axiosForBackend.post('/api/rooms', body);
  return response.data;
}

export async function joinRoom(body: JoinRoomRequest): Promise<RoomInfo> {
  const response = await axiosForBackend.post('/api/rooms/join', body);
  return response.data;
}

export async function leaveRoom(roomId: string): Promise<void> {
  await axiosForBackend.post(`/api/rooms/${roomId}/leave`);
}

export async function startGame(roomId: string): Promise<{ gameId: string }> {
  const response = await axiosForBackend.post(`/api/rooms/${roomId}/start`);
  return response.data;
}

export async function joinMatchQueue(buyinAmount: number): Promise<{ status: string }> {
  const response = await axiosForBackend.post('/api/rooms/match/join', { buyinAmount });
  return response.data;
}

export async function leaveMatchQueue(): Promise<void> {
  await axiosForBackend.post('/api/rooms/match/leave');
}

export async function getMatchStatus(): Promise<{ waiting: boolean; waitingCount: number; roomId: string | null }> {
  const response = await axiosForBackend.get('/api/rooms/match/status');
  return response.data;
}
