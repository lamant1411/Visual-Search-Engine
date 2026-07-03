import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { saveTokens, clearTokens, getAccessToken } from '@/lib/auth/tokenStorage'

// ── Types ─────────────────────────────────────────────────────────

export interface AuthUser {
  id: string
  email: string
  fullName: string
  role: 'user' | 'admin'
}

interface AuthState {
  user: AuthUser | null
  accessToken: string | null
  isAuthenticated: boolean
  isLoading: boolean
}

interface LoginPayload {
  accessToken: string
  refreshToken?: string
  user: AuthUser
}

interface AuthContextValue extends AuthState {
  /** Gọi sau khi API trả về token thành công. */
  login: (payload: LoginPayload) => void
  /** Xoá token khỏi localStorage và reset state. */
  logout: () => void
}

// ── Context ───────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null)

// ── Provider ──────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [accessToken, setAccessToken] = useState<string | null>(null)
  // isLoading = true khi đang restore session từ localStorage khi app khởi động
  const [isLoading, setIsLoading] = useState(true)

  // Khi app mount: kiểm tra xem đã có token chưa để restore session
  useEffect(() => {
    const storedToken = getAccessToken()
    if (storedToken) {
      // Token có trong localStorage → đặt vào state
      // TODO: tuỳ chọn gọi API /me để xác minh token còn hạn và lấy user info
      setAccessToken(storedToken)
    }
    setIsLoading(false)
  }, [])

  const login = useCallback((payload: LoginPayload) => {
    saveTokens(payload.accessToken, payload.refreshToken)
    setAccessToken(payload.accessToken)
    setUser(payload.user)
  }, [])

  const logout = useCallback(() => {
    clearTokens()
    setAccessToken(null)
    setUser(null)
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      accessToken,
      isAuthenticated: !!accessToken,
      isLoading,
      login,
      logout,
    }),
    [user, accessToken, isLoading, login, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// ── Hook ──────────────────────────────────────────────────────────

/** Sử dụng trong bất kỳ component nào bên trong AuthProvider. */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used inside <AuthProvider>')
  }
  return ctx
}
