import type { User } from '@/features/auth/types'

const ACCESS_TOKEN_KEY = 'access_token'
const AUTH_USER_KEY = 'auth_user'

export function getAccessToken() {
  return localStorage.getItem(ACCESS_TOKEN_KEY)
}

export function setAccessToken(token: string) {
  localStorage.setItem(ACCESS_TOKEN_KEY, token)
}

export function getAuthUser(): User | null {
  const rawUser = localStorage.getItem(AUTH_USER_KEY)

  if (!rawUser) {
    return null
  }

  try {
    return JSON.parse(rawUser) as User
  } catch {
    clearAuth()
    return null
  }
}

export function setAuthUser(user: User) {
  localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user))
}

export function clearAuth() {
  localStorage.removeItem(ACCESS_TOKEN_KEY)
  localStorage.removeItem(AUTH_USER_KEY)
}

export function isAuthenticated() {
  return Boolean(getAccessToken())
}

export function isAdmin() {
  return getAuthUser()?.role === 'admin'
}
