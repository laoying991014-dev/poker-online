import { axiosForBackend } from './axios';

import type {
  GameInfo,
  PlayerActionRequest,
  GameRecord,
} from '@shared/api.interface';

export async function getGame(gameId: string): Promise<GameInfo> {
  const response = await axiosForBackend.get(`/api/games/${gameId}`);
  return response.data;
}

export async function playerAction(body: PlayerActionRequest): Promise<GameInfo> {
  const response = await axiosForBackend.post('/api/games/action', body);
  return response.data;
}

export async function getMyRecords(page = 1, pageSize = 20): Promise<{ items: GameRecord[]; total: number; page: number; pageSize: number }> {
  const response = await axiosForBackend.get(`/api/games/my-records?page=${page}&pageSize=${pageSize}`);
  return response.data;
}
