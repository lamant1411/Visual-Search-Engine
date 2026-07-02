export type UserRole = 'user' | 'admin'

export type User = {
  id: string
  email: string
  name?: string
  role: UserRole
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
  accessToken: string
  user: User
}
