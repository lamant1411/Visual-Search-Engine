/**
 * tokenStorage.ts
 * Centralize mọi thao tác đọc/ghi JWT và thông tin user vào localStorage.
 * Dùng key hằng số để tránh typo ở nhiều nơi.
 */

import type { AuthUser } from '@/contexts/AuthContext'

const ACCESS_TOKEN_KEY = 'access_token'
const REFRESH_TOKEN_KEY = 'refresh_token'
const AUTH_USER_KEY = 'auth_user'

// ── Access token ──────────────────────────────────────────────────

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_TOKEN_KEY)
}

export function setAccessToken(token: string): void {
  localStorage.setItem(ACCESS_TOKEN_KEY, token)
}

export function removeAccessToken(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY)
}

// ── Refresh token ─────────────────────────────────────────────────

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY)
}

export function setRefreshToken(token: string): void {
  localStorage.setItem(REFRESH_TOKEN_KEY, token)
}

export function removeRefreshToken(): void {
  localStorage.removeItem(REFRESH_TOKEN_KEY)
}

// ── Auth user ─────────────────────────────────────────────────────

export function getAuthUser(): AuthUser | null {
  const raw = localStorage.getItem(AUTH_USER_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as AuthUser
  } catch {
    clearTokens()
    return null
  }
}

export function setAuthUser(user: AuthUser): void {
  localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user))
}

export function removeAuthUser(): void {
  localStorage.removeItem(AUTH_USER_KEY)
}

// ── Composite helpers ─────────────────────────────────────────────

/** Lưu cả access + refresh token (dùng khi login/register thành công). */
export function saveTokens(accessToken: string, refreshToken?: string): void {
  setAccessToken(accessToken)
  if (refreshToken) setRefreshToken(refreshToken)
}

/** Xoá toàn bộ token và thông tin user (dùng khi logout). */
export function clearTokens(): void {
  removeAccessToken()
  removeRefreshToken()
  removeAuthUser()
}

// ── Auth state helpers ────────────────────────────────────────────

export function isAuthenticated(): boolean {
  return Boolean(getAccessToken())
}

export function isAdmin(): boolean {
  return getAuthUser()?.role === 'admin'
}
