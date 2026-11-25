import { axiosForBackend } from './axios';
export const listAdminClubs = async () => (await axiosForBackend.get('/api/admin/clubs')).data;
export const createAdminClub = async (body: {name:string;description?:string;ownerId?:string;scheduleType?:string;dailyStartTime?:string;startsAt?:string;smallBlind?:number;bigBlind?:number;minBuyin?:number;maxBuyin?:number;maxPlayers?:number;autoStart?:boolean}) => (await axiosForBackend.post('/api/admin/clubs',body)).data;
export const updateAdminClub = async (id:string,body:{status?:string;scheduleType?:string;dailyStartTime?:string;startsAt?:string;smallBlind?:number;bigBlind?:number;minBuyin?:number;maxBuyin?:number;maxPlayers?:number;autoStart?:boolean}) => (await axiosForBackend.patch('/api/admin/clubs/'+id,body)).data;
export const listAdminTournaments = async () => (await axiosForBackend.get('/api/admin/tournaments')).data;
export const createAdminTournament = async (body: {name:string;description?:string;entryFee:number;prizePool:number;maxPlayers:number;startsAt?:string;status:string}) => (await axiosForBackend.post('/api/admin/tournaments',body)).data;
export const updateAdminTournament = async (id:string,status:string) => (await axiosForBackend.patch('/api/admin/tournaments/'+id,{status})).data;
export const listComplianceRequests = async () => (await axiosForBackend.get('/api/admin/compliance-requests')).data;
export const updateComplianceRequest = async (id:string,status:string,adminNote:string) => (await axiosForBackend.patch('/api/admin/compliance-requests/'+id,{status,adminNote})).data;

export const endAdminClub = async (id:string) => (await axiosForBackend.post('/api/admin/clubs/'+id+'/end')).data;
