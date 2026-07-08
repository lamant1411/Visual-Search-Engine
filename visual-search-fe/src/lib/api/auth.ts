import { apiClient } from './client'

// ── Response types khớp với backend ──────────────────────────────

/** Trả về từ POST /register */
export interface RegisterResponse {
  id: number
  email: string
  username: string
  full_name: string
  role: string
  is_active: boolean
  created_at: string
  updated_at: string | null
  last_login_at: string | null
}

/** Trả về từ POST /login và POST /refresh */
export interface TokenResponse {
  access_token: string
  refresh_token?: string
  token_type: string
}

/** Trả về từ GET /me */
export interface MeResponse {
  id: number
  email: string
  username: string
  full_name: string
  role: string
  is_active: boolean
  created_at: string
  updated_at: string | null
  last_login_at: string | null
}

// ── Request types ─────────────────────────────────────────────────

export interface RegisterRequest {
  email: string
  password: string
  full_name: string
}

export interface LoginRequest {
  email: string
  password: string
}

// ── API functions ─────────────────────────────────────────────────

export const authApi = {
  /** POST /register — tạo tài khoản mới */
  register: (data: RegisterRequest) =>
    apiClient.post<RegisterResponse>('/auth/register', data).then(r => r.data),

  /** POST /login — đăng nhập, trả về JWT */
  login: (data: LoginRequest) =>
    apiClient.post<TokenResponse>('/auth/login', data).then(r => r.data),

  /** POST /refresh — lấy access_token mới bằng refresh_token */
  refresh: (refreshToken: string) =>
    apiClient
      .post<TokenResponse>('/auth/refresh', { refresh_token: refreshToken })
      .then(r => r.data),

  /** POST /logout — huỷ session phía server (nếu có) */
  logout: () =>
    apiClient.post<{ message: string }>('/auth/logout').then(r => r.data),

  /** GET /me — lấy thông tin user hiện tại (dùng để restore session) */
  me: () => apiClient.get<MeResponse>('/auth/me').then(r => r.data),
}
