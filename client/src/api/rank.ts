import { axiosForBackend } from './axios';
import type { RankListResponse } from '@shared/api.interface';

export const getCoinRank = async (limit = 20): Promise<RankListResponse> => {
  const res = await axiosForBackend.get(`/api/rank/coins?limit=${limit}`);
  return res.data;
};

export const getWinRank = async (limit = 20): Promise<RankListResponse> => {
  const res = await axiosForBackend.get(`/api/rank/wins?limit=${limit}`);
  return res.data;
};
