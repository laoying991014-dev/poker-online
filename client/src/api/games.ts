import { axiosForBackend } from './axios';
import { getToken, clearAuth } from './auth';

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

/**
 * Subscribe to room changes using authenticated Server-Sent Events.
 * The stream contains notifications only; each client fetches its own sanitized game state.
 */
export function subscribeToRoomEvents(
  roomId: string,
  onUpdate: () => void,
  onConnectionChange?: (connected: boolean) => void,
): () => void {
  let stopped = false;
  let retryDelay = 1000;
  let retryTimer: number | null = null;
  let activeController: AbortController | null = null;

  const handleFrame = (frame: string) => {
    const data = frame
      .split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .join('\n');

    if (!data) return;
    try {
      const event = JSON.parse(data) as { type?: string };
      if (event.type === 'room-updated') onUpdate();
    } catch {
      // Ignore malformed keep-alive frames; the fallback polling remains active.
    }
  };

  const scheduleReconnect = () => {
    if (stopped || retryTimer !== null) return;
    onConnectionChange?.(false);
    retryTimer = window.setTimeout(() => {
      retryTimer = null;
      void connect();
    }, retryDelay);
    retryDelay = Math.min(retryDelay * 2, 15_000);
  };

  const connect = async () => {
    if (stopped) return;
    const token = getToken();
    if (!token) return;

    const controller = new AbortController();
    activeController = controller;
    let authFailed = false;

    try {
      const response = await fetch(
        `/api/games/rooms/${encodeURIComponent(roomId)}/events`,
        {
          method: 'GET',
          headers: {
            Accept: 'text/event-stream',
            Authorization: `Bearer ${token}`,
          },
          cache: 'no-store',
          signal: controller.signal,
        },
      );

      if (response.status === 401) {
        authFailed = true;
        clearAuth();
        const currentPath = window.location.pathname + window.location.search;
        window.dispatchEvent(
          new CustomEvent('auth:401', { detail: { redirect: currentPath } }),
        );
        return;
      }

      if (!response.ok || !response.body) {
        throw new Error(`实时连接失败：HTTP ${response.status}`);
      }

      retryDelay = 1000;
      onConnectionChange?.(true);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (!stopped) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        let boundary = /\r?\n\r?\n/.exec(buffer);
        while (boundary) {
          handleFrame(buffer.slice(0, boundary.index));
          buffer = buffer.slice(boundary.index + boundary[0].length);
          boundary = /\r?\n\r?\n/.exec(buffer);
        }
      }

      buffer += decoder.decode();
      if (buffer.trim()) handleFrame(buffer);
    } catch {
      if (stopped || controller.signal.aborted) return;
    } finally {
      if (activeController === controller) activeController = null;
      if (!stopped && !authFailed) scheduleReconnect();
    }
  };

  void connect();

  return () => {
    stopped = true;
    activeController?.abort();
    if (retryTimer !== null) window.clearTimeout(retryTimer);
    retryTimer = null;
  };
}
