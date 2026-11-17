import axios from 'axios';

const TOKEN_KEY = 'poker_auth_token';
const USER_KEY = 'poker_user_info';

/**
 * 独立部署后统一使用同源 API：
 * - 生产环境由 NestJS 同时提供 /api 与前端静态文件
 * - 本地开发时 Vite 代理 /api 到 localhost:3000
 */
export const axiosForBackend = axios.create({
  baseURL: '',
  timeout: 20000,
});

axiosForBackend.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

axiosForBackend.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      if (typeof window !== 'undefined') {
        const currentPath = window.location.pathname + window.location.search;
        if (!currentPath.includes('/login') && !currentPath.includes('/register')) {
          window.dispatchEvent(
            new CustomEvent('auth:401', { detail: { redirect: currentPath } }),
          );
        }
      }
    }
    return Promise.reject(error);
  },
);
