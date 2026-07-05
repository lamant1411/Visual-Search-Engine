import axios from 'axios'
import { getAccessToken } from '@/lib/auth/tokenStorage'

import { getAccessToken } from '@/lib/auth/authStorage'

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
