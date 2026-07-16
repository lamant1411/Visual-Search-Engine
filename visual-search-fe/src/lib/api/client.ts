import axios from 'axios'
import { AUTH_UNAUTHORIZED_EVENT } from '@/lib/auth/authEvents'
import { clearTokens, getAccessToken } from '@/lib/auth/tokenStorage'

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  timeout: 10000,
})

// Tự động đính kèm JWT vào mọi request
apiClient.interceptors.request.use((config) => {
  const token = getAccessToken()

  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (axios.isAxiosError(error) && error.response?.status === 401 && !isLoginRequest(error.config?.url)) {
      clearTokens()
      window.dispatchEvent(new Event(AUTH_UNAUTHORIZED_EVENT))
    }

    return Promise.reject(error)
  },
)

function isLoginRequest(url?: string) {
  return Boolean(url?.includes('/auth/login'))
}
