import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL?.replace(/\/$/, '') ?? '';
const TOKEN_STORAGE_KEY = 'neckon.authToken';

type ApiRequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  auth?: boolean;
  formData?: FormData;
};

export type ApiUser = {
  id: number;
  username?: string;
  email: string;
  nickname?: string | null;
  profile_image?: string | null;
};

export type TodayDashboard = {
  total_usage_seconds: number;
  total_usage_minutes: number;
  normal_seconds: number;
  warning_seconds: number;
  danger_seconds: number;
  danger_count: number;
  good_posture_rate: number;
};

export type WeeklyDashboardItem = {
  date: string;
  day_label: string;
  total_usage_seconds: number;
  total_usage_minutes: number;
  normal_seconds: number;
  warning_seconds: number;
  danger_seconds: number;
  danger_count: number;
  good_posture_rate: number;
};

export type NotificationItem = {
  id: number;
  user_id?: number;
  status?: string;
  message: string;
  created_at: string;
};

class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

let memoryToken: string | null = null;

const getWebStorage = () => {
  if (typeof globalThis === 'undefined' || !('localStorage' in globalThis)) {
    return null;
  }

  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
};

export const getAuthToken = async () => {
  if (memoryToken) {
    return memoryToken;
  }

  if (Platform.OS === 'web') {
    const storage = getWebStorage();
    memoryToken = storage?.getItem(TOKEN_STORAGE_KEY) ?? null;
    return memoryToken;
  }

  memoryToken = await SecureStore.getItemAsync(TOKEN_STORAGE_KEY);
  return memoryToken;
};

export const setAuthToken = async (token: string) => {
  memoryToken = token;

  if (Platform.OS === 'web') {
    getWebStorage()?.setItem(TOKEN_STORAGE_KEY, token);
    return;
  }

  await SecureStore.setItemAsync(TOKEN_STORAGE_KEY, token);
};

export const clearAuthToken = async () => {
  memoryToken = null;

  if (Platform.OS === 'web') {
    getWebStorage()?.removeItem(TOKEN_STORAGE_KEY);
    return;
  }

  await SecureStore.deleteItemAsync(TOKEN_STORAGE_KEY);
};

export const hasApiBaseUrl = () => Boolean(API_BASE_URL);

export const getApiBaseUrl = () => API_BASE_URL;

const resolveUrl = (path: string) => {
  if (!API_BASE_URL) {
    throw new ApiError('GCP 서버 주소가 설정되지 않았습니다. EXPO_PUBLIC_API_BASE_URL을 확인해주세요.', 0);
  }

  return `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
};

const request = async <T>(path: string, options: ApiRequestOptions = {}) => {
  const headers = new Headers();
  const token = await getAuthToken();

  if (options.auth !== false && token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  let body: BodyInit | undefined;

  if (options.formData) {
    body = options.formData;
  } else if (options.body !== undefined) {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(options.body);
  }

  const response = await fetch(resolveUrl(path), {
    method: options.method ?? 'GET',
    headers,
    body,
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new ApiError(data?.message ?? data?.error ?? '서버 요청에 실패했습니다.', response.status);
  }

  return data as T;
};

export const api = {
  login: async (payload: { email: string; password: string }) => {
    const response = await request<{ token: string; user: ApiUser }>('/auth/login', {
      method: 'POST',
      body: payload,
      auth: false,
    });

    await setAuthToken(response.token);
    return response;
  },

  register: async (payload: { email: string; password: string; nickname: string }) => {
    const formData = new FormData();
    formData.append('username', payload.email);
    formData.append('email', payload.email);
    formData.append('password', payload.password);
    formData.append('nickname', payload.nickname);

    const response = await request<{ token: string; user: ApiUser }>('/auth/register', {
      method: 'POST',
      formData,
      auth: false,
    });

    await setAuthToken(response.token);
    return response;
  },

  getProfile: async () =>
    request<{ data: ApiUser }>('/users/me'),

  updateProfile: async (payload: { nickname?: string; password?: string }) =>
    request<{ data: ApiUser }>('/users/me', {
      method: 'PATCH',
      body: payload,
    }),

  getTodayDashboard: async () =>
    request<{ data: TodayDashboard }>('/dashboard/today'),

  getWeeklyDashboard: async () =>
    request<{ data: { chart: WeeklyDashboardItem[] } }>('/dashboard/weekly'),

  getNotifications: async () =>
    request<NotificationItem[] | { data: NotificationItem[] }>('/notifications'),

  sendContact: async (payload: { category: 'bug_report' | 'feature_request' | 'other'; content: string }) =>
    request('/contacts', {
      method: 'POST',
      body: payload,
    }),
};

export const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message;
  }

  return '알 수 없는 오류가 발생했습니다.';
};
