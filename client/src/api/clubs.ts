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
  sessionStatus: 'scheduled' | 'running' | 'ending' | 'finished';
  sessionStartedAt: string | null;
  sessionEndedAt: string | null;
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

export interface MyClubStat {
  clubId: string;
  clubName: string;
  games: number;
  wins: number;
  totalProfit: number;
  waterUp: number;
  waterDown: number;
}

export async function getMyClubStats(): Promise<MyClubStat[]> {
  const response = await axiosForBackend.get('/api/rooms/clubs/stats/me');
  return response.data;
}

export interface ClubSessionResult {
  clubId: string;
  clubName: string;
  sessionStatus: string;
  sessionStartedAt?: string | null;
  sessionEndedAt?: string | null;
  results: Array<{userId:string;nickname:string;games:number;wins:number;totalProfit:number;waterUp:number;waterDown:number}>;
}

export async function getPublicClubSessionResults(): Promise<ClubSessionResult[]> {
  const response = await axiosForBackend.get('/api/rooms/clubs/results');
  return response.data;
}
