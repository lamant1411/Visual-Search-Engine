export type UserRole = 'user' | 'admin'

export type User = {
  id: number
  email: string
  role: UserRole
  isActive?: boolean
  createdAt?: string
  updatedAt?: string | null
  lastLoginAt?: string | null
}

export type LoginRequest = {
  email: string
  password: string
}

export type RegisterRequest = {
  email: string
  password: string
  name?: string
}

export type AuthResponse = {
  access_token: string
  token_type: 'bearer'
  user: User
}
