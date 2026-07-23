import axios from 'axios'
import { AUTH_UNAUTHORIZED_EVENT } from '@/lib/auth/authEvents'
import { clearTokens, getAccessToken } from '@/lib/auth/tokenStorage'

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  timeout: 20000,
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

    if (axios.isAxiosError(error)) {
      const data = error.response?.data
      const apiMessage =
        typeof data?.message === 'string' && data.message.trim()
          ? data.message
          : typeof data?.detail?.message === 'string' && data.detail.message.trim()
            ? data.detail.message
            : typeof data?.detail === 'string' && data.detail.trim()
              ? data.detail
              : undefined

      if (apiMessage) {
        error.message = apiMessage
      }
    }

    return Promise.reject(error)
  },
)

function isLoginRequest(url?: string) {
  return Boolean(url?.includes('/auth/login'))
}
