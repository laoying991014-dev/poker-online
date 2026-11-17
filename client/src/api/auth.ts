import { axiosForBackend } from './axios';

import type {
  RegisterRequest,
  LoginRequest,
  AuthResponse,
  UserInfo,
} from '@shared/api.interface';

const TOKEN_KEY = 'poker_auth_token';
const USER_KEY = 'poker_user_info';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearAuth(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function getCachedUser(): UserInfo | null {
  const data = localStorage.getItem(USER_KEY);
  if (!data) return null;
  try {
    return JSON.parse(data) as UserInfo;
  } catch {
    return null;
  }
}

export function setCachedUser(user: UserInfo): void {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function updateCachedUserCoins(coins: number): void {
  const user = getCachedUser();
  if (user) {
    user.coins = coins;
    setCachedUser(user);
  }
}

export async function register(body: RegisterRequest): Promise<AuthResponse> {
  const response = await axiosForBackend.post('/api/auth/register', body);
  const data = response.data as AuthResponse;
  setToken(data.token);
  setCachedUser(data.user);
  return data;
}

export async function login(body: LoginRequest): Promise<AuthResponse> {
  const response = await axiosForBackend.post('/api/auth/login', body);
  const data = response.data as AuthResponse;
  setToken(data.token);
  setCachedUser(data.user);
  return data;
}

export async function getCurrentUser(): Promise<UserInfo> {
  const response = await axiosForBackend.get('/api/auth/me');
  const data = response.data as UserInfo;
  setCachedUser(data);
  return data;
}

export function extractErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'response' in error) {
    const err = error as { response?: { data?: { error?: { message?: string; fieldErrors?: Record<string, string[]> } } } };
    const msg = err.response?.data?.error?.message;
    if (msg) return msg;
    const fieldErrors = err.response?.data?.error?.fieldErrors;
    if (fieldErrors) {
      const firstKey = Object.keys(fieldErrors)[0];
      if (firstKey && fieldErrors[firstKey]?.[0]) return fieldErrors[firstKey][0];
    }
  }
  return '操作失败，请重试';
}

export function isLoggedIn(): boolean {
  return !!getToken();
}

export function logout(): void {
  clearAuth();
}
