import { axiosForBackend } from './axios';

export interface PublicClub {
  id: string;
  name: string;
  description: string | null;
  scheduleType: 'none' | 'daily' | 'once';
  dailyStartTime: string | null;
  startsAt: string | null;
  smallBlind: number;
  bigBlind: number;
  minBuyin: number;
  maxBuyin: number;
  maxPlayers: number;
  autoStart: boolean;
  memberCount: number;
}

export async function listPublicClubs(): Promise<PublicClub[]> {
  const response = await axiosForBackend.get('/api/clubs');
  return response.data;
}

export async function joinPublicClub(clubId: string): Promise<import('@shared/api.interface').RoomInfo> {
  const response = await axiosForBackend.post(`/api/rooms/clubs/${clubId}/join`, {
    timezoneOffsetMinutes: new Date().getTimezoneOffset(),
  });
  return response.data;
}
