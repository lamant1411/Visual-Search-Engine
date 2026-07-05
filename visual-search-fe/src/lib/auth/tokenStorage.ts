/**
 * tokenStorage.ts
 * Centralize mọi thao tác đọc/ghi JWT vào localStorage.
 * Dùng key hằng số để tránh typo ở nhiều nơi.
 */

const ACCESS_TOKEN_KEY = 'access_token'
const REFRESH_TOKEN_KEY = 'refresh_token'

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

// ── Composite helpers ─────────────────────────────────────────────

/** Lưu cả access + refresh token (dùng khi login/register thành công). */
export function saveTokens(accessToken: string, refreshToken?: string): void {
  setAccessToken(accessToken)
  if (refreshToken) setRefreshToken(refreshToken)
}

/** Xoá toàn bộ token (dùng khi logout). */
export function clearTokens(): void {
  removeAccessToken()
  removeRefreshToken()
}
