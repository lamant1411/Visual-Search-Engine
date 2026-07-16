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
import { authApi } from '@/lib/api/auth'
import { AUTH_UNAUTHORIZED_EVENT } from '@/lib/auth/authEvents'

// ── Types ─────────────────────────────────────────────────────────

/** Khớp với response của GET /me */
export interface AuthUser {
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

interface AuthState {
  user: AuthUser | null
  accessToken: string | null
  isAuthenticated: boolean
  isLoading: boolean
}

interface LoginPayload {
  /** access_token từ POST /login */
  accessToken: string
  /** refresh_token từ POST /login (tuỳ chọn) */
  refreshToken?: string
  user: AuthUser
}

interface AuthContextValue extends AuthState {
  /** Gọi sau khi API trả về token thành công. */
  login: (payload: LoginPayload) => void
  /** Gọi POST /logout + xoá token khỏi localStorage. */
  logout: () => Promise<void>
}

// ── Context ───────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null)

// ── Provider ──────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Khi app mount: nếu có token trong localStorage → lưu vào state trước,
  // sau đó gọi /me để xác minh và lấy thông tin user.
  useEffect(() => {
    const storedToken = getAccessToken()
    if (!storedToken) {
      setIsLoading(false)
      return
    }

    // Lưu token vào state trước để axios interceptor có thể gắn vào header
    setAccessToken(storedToken)

    authApi.me()
      .then((meData) => {
        setUser(meData)
      })
      .catch(() => {
        // Token không hợp lệ hoặc hết hạn → xóa đi
        clearTokens()
        setAccessToken(null)
      })
      .finally(() => {
        setIsLoading(false)
      })
  }, [])

  useEffect(() => {
    function handleUnauthorized() {
      setAccessToken(null)
      setUser(null)
    }

    window.addEventListener(AUTH_UNAUTHORIZED_EVENT, handleUnauthorized)
    return () => window.removeEventListener(AUTH_UNAUTHORIZED_EVENT, handleUnauthorized)
  }, [])

  const login = useCallback((payload: LoginPayload) => {
    saveTokens(payload.accessToken, payload.refreshToken)
    setAccessToken(payload.accessToken)
    setUser(payload.user)
  }, [])

  const logout = useCallback(async () => {
    try {
      await authApi.logout()
    } catch {
      // Bỏ qua lỗi logout phía server, vẫn xoá token local
    } finally {
      clearTokens()
      setAccessToken(null)
      setUser(null)
    }
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
