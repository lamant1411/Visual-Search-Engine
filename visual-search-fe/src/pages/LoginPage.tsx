import React, { useState } from 'react'
import axios from 'axios'
import { Link, useNavigate, useLocation } from 'react-router'
import { Input } from '@/components/base/input'
import { Button } from '@/components/base/button'
import { AuthCard } from '@/components/feature/auth/AuthCard'
import { useAuth } from '@/contexts/AuthContext'
import { authApi } from '@/lib/api/auth'
import { saveTokens } from '@/lib/auth/tokenStorage'

// ---- icons (inline SVG nhỏ gọn, không cần thư viện) ----

const MailIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
    <path d="M3 4a2 2 0 0 0-2 2v.217l9 5.25 9-5.25V6a2 2 0 0 0-2-2H3Z" />
    <path d="M19 8.234l-7.864 4.587a2 2 0 0 1-2.272 0L1 8.234V14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8.234Z" />
  </svg>
)

const LockIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
    <path fillRule="evenodd" d="M10 1a4.5 4.5 0 0 0-4.5 4.5V9H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-.5V5.5A4.5 4.5 0 0 0 10 1Zm3 8V5.5a3 3 0 1 0-6 0V9h6Z" clipRule="evenodd" />
  </svg>
)

const EyeIcon = ({ open }: { open: boolean }) =>
  open ? (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
      <path d="M10 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />
      <path fillRule="evenodd" d="M.664 10.59a1.651 1.651 0 0 1 0-1.186A10.004 10.004 0 0 1 10 3c4.257 0 7.893 2.66 9.336 6.41.147.381.146.804 0 1.186A10.004 10.004 0 0 1 10 17c-4.257 0-7.893-2.66-9.336-6.41ZM14 10a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z" clipRule="evenodd" />
    </svg>
  ) : (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
      <path fillRule="evenodd" d="M3.28 2.22a.75.75 0 0 0-1.06 1.06l14.5 14.5a.75.75 0 1 0 1.06-1.06l-1.745-1.745a10.029 10.029 0 0 0 3.3-4.38 1.651 1.651 0 0 0 0-1.185A10.004 10.004 0 0 0 9.999 3a9.956 9.956 0 0 0-4.744 1.194L3.28 2.22ZM7.752 6.69l1.092 1.092a2.5 2.5 0 0 1 3.374 3.373l1.091 1.092a4 4 0 0 0-5.557-5.557Z" clipRule="evenodd" />
      <path d="m10.748 13.93 2.523 2.524a9.987 9.987 0 0 1-3.27.547c-4.258 0-7.894-2.66-9.337-6.41a1.651 1.651 0 0 1 0-1.186A10.007 10.007 0 0 1 2.839 6.02L6.07 9.252a4 4 0 0 0 4.678 4.678Z" />
    </svg>
  )

// ---- Logo component ----

const AppLogo = () => (
  <div className="flex items-center gap-3">
    <div className="w-10 h-10 rounded-[12px] bg-gradient-to-br from-[#7c3aed] to-[#4f46e5] flex items-center justify-center shadow-lg shadow-[#7c3aed]/30">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white" className="w-5 h-5">
        <path d="M11.645 20.91l-.007-.003-.022-.012a15.247 15.247 0 0 1-.383-.218 25.18 25.18 0 0 1-4.244-3.17C4.688 15.36 2.25 12.174 2.25 8.25 2.25 5.322 4.714 3 7.688 3A5.5 5.5 0 0 1 12 5.052 5.5 5.5 0 0 1 16.313 3c2.973 0 5.437 2.322 5.437 5.25 0 3.925-2.438 7.111-4.739 9.256a25.175 25.175 0 0 1-4.244 3.17 15.247 15.247 0 0 1-.383.219l-.022.012-.007.004-.003.001a.752.752 0 0 1-.704 0l-.003-.001Z" />
      </svg>
    </div>
    <span className="text-lg font-bold text-[#1e1b4b]">VisualSearch</span>
  </div>
)

// ---- Form state types ----

interface LoginForm {
  email: string
  password: string
}

interface LoginErrors {
  email?: string
  password?: string
  general?: string
}

// ---- LoginPage ----

export default function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { login } = useAuth()
  // Nếu user bị redirect từ ProtectedRoute, lấy URL cũ để quay lại sau khi login
  const from = (location.state as { from?: { pathname: string } })?.from?.pathname ?? '/search'
  const [form, setForm] = useState<LoginForm>({ email: '', password: '' })
  const [errors, setErrors] = useState<LoginErrors>({})
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setForm(prev => ({ ...prev, [name]: value }))
    // Xoá lỗi khi user bắt đầu nhập lại
    if (errors[name as keyof LoginErrors]) {
      setErrors(prev => ({ ...prev, [name]: undefined }))
    }
  }

  const validate = (): boolean => {
    const newErrors: LoginErrors = {}

    if (!form.email.trim()) {
      newErrors.email = 'Email is required.'
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      newErrors.email = 'Invalid email address.'
    }

    const pwdRules = [
      { test: !form.password,                       msg: 'Password is required.' },
      { test: form.password.length < 8,             msg: 'Password must be at least 8 characters.' },
      { test: !/[A-Z]/.test(form.password),         msg: 'Password must contain at least 1 uppercase letter.' },
      { test: !/[0-9]/.test(form.password),         msg: 'Password must contain at least 1 number.' },
      { test: !/[^A-Za-z0-9]/.test(form.password), msg: 'Password must contain at least 1 special character.' },
    ]
    const firstPwdError = pwdRules.find(r => r.test)
    if (firstPwdError) newErrors.password = firstPwdError.msg

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return

    setLoading(true)
    try {
      // Step 1: get token
      const tokenRes = await authApi.login({ email: form.email, password: form.password })

      // Step 2: save token to localStorage
      saveTokens(tokenRes.access_token, tokenRes.refresh_token)

      // Step 3: get user profile
      const meRes = await authApi.me()

      // Step 4: save to auth context
      login({
        accessToken: tokenRes.access_token,
        refreshToken: tokenRes.refresh_token,
        user: meRes,
      })

      navigate(from, { replace: true })
    } catch (err) {
      console.error('[LoginPage]', err)
      if (axios.isAxiosError(err)) {
        const status = err.response?.status
        if (status === 401) {
          setErrors({ general: 'Invalid email or password.' })
        } else if (status === 422) {
          setErrors({ general: 'Invalid data. Please check and try again.' })
        } else {
          setErrors({ general: 'Login failed. Please try again.' })
        }
      } else {
        setErrors({ general: 'Connection error. Please try again.' })
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthCard
      logo={<AppLogo />}
      title="Welcome back"
      subtitle="Sign in to continue exploring images"
      footer={
        <>
          Don't have an account?{' '}
          <Link
            to="/register"
            className="font-semibold text-[#7c3aed] hover:text-[#6d28d9] transition-colors"
          >
            Register now
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
        {/* General error */}
        {errors.general && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-[10px] bg-red-50 border border-red-200 text-sm text-red-700">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 shrink-0">
              <path fillRule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-8-5a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-1.5 0v-4.5A.75.75 0 0 1 10 5Zm0 10a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd" />
            </svg>
            {errors.general}
          </div>
        )}

        <Input
          label="Email"
          id="login-email"
          name="email"
          type="email"
          placeholder="you@example.com"
          value={form.email}
          onChange={handleChange}
          errorMessage={errors.email}
          leftIcon={<MailIcon />}
          autoComplete="email"
          size="lg"
        />

        <Input
          label="Password"
          id="login-password"
          name="password"
          type={showPassword ? 'text' : 'password'}
          placeholder="••••••••"
          value={form.password}
          onChange={handleChange}
          errorMessage={errors.password}
          leftIcon={<LockIcon />}
          rightIcon={
            <button
              type="button"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              onClick={() => setShowPassword(v => !v)}
              className="pointer-events-auto text-[#9ca3af] hover:text-[#6d28d9] transition-colors"
            >
              <EyeIcon open={showPassword} />
            </button>
          }
          autoComplete="current-password"
          size="lg"
        />

        <Button
          type="submit"
          variant="primary"
          size="lg"
          fullWidth
          loading={loading}
          className="mt-1 bg-gradient-to-r from-[#7c3aed] to-[#4f46e5] hover:from-[#6d28d9] hover:to-[#4338ca] shadow-lg shadow-[#7c3aed]/30 border-0"
        >
          Sign in
        </Button>
      </form>
    </AuthCard>
  )
}
