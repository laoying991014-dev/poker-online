import { axiosForBackend } from './axios';

export interface PublicClub {
  id: string;
  name: string;
  description: string | null;
  scheduleType: 'none' | 'daily' | 'once';
  dailyStartTime: string | null;
  startsAt: string | null;
  memberCount: number;
}

export async function listPublicClubs(): Promise<PublicClub[]> {
  const response = await axiosForBackend.get('/api/clubs');
  return response.data;
}
