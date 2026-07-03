import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Input } from '@/components/base/input'
import { Button } from '@/components/base/button'
import { AuthCard } from '@/components/feature/auth/AuthCard'

// ---- Icons ----

const UserIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
    <path d="M10 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM3.465 14.493a1.23 1.23 0 0 0 .41 1.412A9.957 9.957 0 0 0 10 18c2.31 0 4.438-.784 6.131-2.1.43-.333.604-.903.408-1.41a7.002 7.002 0 0 0-13.074.003Z" />
  </svg>
)

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

const CheckIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
    <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />
  </svg>
)

// ---- Logo ----

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

// ---- Password strength ----

function getPasswordStrength(password: string): { score: number; label: string; color: string } {
  if (!password) return { score: 0, label: '', color: '' }
  let score = 0
  if (password.length >= 8) score++
  if (/[A-Z]/.test(password)) score++
  if (/[0-9]/.test(password)) score++
  if (/[^A-Za-z0-9]/.test(password)) score++

  if (score <= 1) return { score, label: 'Yếu', color: '#ef4444' }
  if (score === 2) return { score, label: 'Trung bình', color: '#f59e0b' }
  if (score === 3) return { score, label: 'Tốt', color: '#10b981' }
  return { score, label: 'Mạnh', color: '#7c3aed' }
}

// ---- Form types ----

interface RegisterForm {
  fullName: string
  email: string
  password: string
  confirmPassword: string
  agreeTerms: boolean
}

interface RegisterErrors {
  fullName?: string
  email?: string
  password?: string
  confirmPassword?: string
  agreeTerms?: string
  general?: string
}

// ---- RegisterPage ----

export default function RegisterPage() {
  const navigate = useNavigate()
  const [form, setForm] = useState<RegisterForm>({
    fullName: '',
    email: '',
    password: '',
    confirmPassword: '',
    agreeTerms: false,
  })
  const [errors, setErrors] = useState<RegisterErrors>({})
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [loading, setLoading] = useState(false)

  const strength = getPasswordStrength(form.password)

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target
    setForm(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }))
    if (errors[name as keyof RegisterErrors]) {
      setErrors(prev => ({ ...prev, [name]: undefined }))
    }
  }

  const validate = (): boolean => {
    const newErrors: RegisterErrors = {}
    if (!form.fullName.trim()) newErrors.fullName = 'Họ tên không được để trống.'
    if (!form.email.trim()) {
      newErrors.email = 'Email không được để trống.'
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      newErrors.email = 'Email không hợp lệ.'
    }
    if (!form.password) {
      newErrors.password = 'Mật khẩu không được để trống.'
    } else if (form.password.length < 8) {
      newErrors.password = 'Mật khẩu phải có ít nhất 8 ký tự.'
    }
    if (!form.confirmPassword) {
      newErrors.confirmPassword = 'Vui lòng xác nhận mật khẩu.'
    } else if (form.confirmPassword !== form.password) {
      newErrors.confirmPassword = 'Mật khẩu xác nhận không khớp.'
    }
    if (!form.agreeTerms) newErrors.agreeTerms = 'Bạn phải đồng ý với điều khoản dịch vụ.'
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return

    setLoading(true)
    try {
      // TODO: gọi API register thực tế
      await new Promise(r => setTimeout(r, 1200))
      navigate('/login')
    } catch {
      setErrors({ general: 'Đã xảy ra lỗi. Vui lòng thử lại sau.' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthCard
      logo={<AppLogo />}
      title="Tạo tài khoản mới"
      subtitle="Tham gia ngay để khám phá sức mạnh tìm kiếm bằng hình ảnh"
      footer={
        <>
          Đã có tài khoản?{' '}
          <Link
            to="/login"
            className="font-semibold text-[#7c3aed] hover:text-[#6d28d9] transition-colors"
          >
            Đăng nhập
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
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
          label="Họ và tên"
          id="register-fullname"
          name="fullName"
          type="text"
          placeholder="Nguyễn Văn A"
          value={form.fullName}
          onChange={handleChange}
          errorMessage={errors.fullName}
          leftIcon={<UserIcon />}
          autoComplete="name"
          size="lg"
        />

        <Input
          label="Email"
          id="register-email"
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

        {/* Password + strength bar */}
        <div className="flex flex-col gap-1.5">
          <Input
            label="Mật khẩu"
            id="register-password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            placeholder="Ít nhất 8 ký tự"
            value={form.password}
            onChange={handleChange}
            errorMessage={errors.password}
            leftIcon={<LockIcon />}
            rightIcon={
              <button
                type="button"
                aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                onClick={() => setShowPassword(v => !v)}
                className="pointer-events-auto text-[#9ca3af] hover:text-[#6d28d9] transition-colors"
              >
                <EyeIcon open={showPassword} />
              </button>
            }
            autoComplete="new-password"
            size="lg"
          />

          {/* Strength bar */}
          {form.password && (
            <div className="flex items-center gap-2 px-1">
              <div className="flex gap-1 flex-1">
                {[1, 2, 3, 4].map(i => (
                  <div
                    key={i}
                    className="h-1 flex-1 rounded-full transition-all duration-300"
                    style={{
                      backgroundColor: i <= strength.score ? strength.color : '#e5e7eb',
                    }}
                  />
                ))}
              </div>
              <span className="text-xs font-medium" style={{ color: strength.color }}>
                {strength.label}
              </span>
            </div>
          )}

          {/* Password hints */}
          {form.password && (
            <ul className="grid grid-cols-2 gap-x-4 gap-y-1 px-1 mt-1">
              {[
                { rule: form.password.length >= 8, label: 'Ít nhất 8 ký tự' },
                { rule: /[A-Z]/.test(form.password), label: 'Chữ hoa (A-Z)' },
                { rule: /[0-9]/.test(form.password), label: 'Chữ số (0-9)' },
                { rule: /[^A-Za-z0-9]/.test(form.password), label: 'Ký tự đặc biệt' },
              ].map(({ rule, label }) => (
                <li
                  key={label}
                  className={`flex items-center gap-1.5 text-xs transition-colors ${rule ? 'text-[#10b981]' : 'text-[#9ca3af]'
                    }`}
                >
                  <span className={`rounded-full p-0.5 ${rule ? 'bg-[#10b981] text-white' : 'bg-[#e5e7eb] text-[#9ca3af]'}`}>
                    <CheckIcon />
                  </span>
                  {label}
                </li>
              ))}
            </ul>
          )}
        </div>

        <Input
          label="Xác nhận mật khẩu"
          id="register-confirm"
          name="confirmPassword"
          type={showConfirm ? 'text' : 'password'}
          placeholder="Nhập lại mật khẩu"
          value={form.confirmPassword}
          onChange={handleChange}
          errorMessage={errors.confirmPassword}
          leftIcon={<LockIcon />}
          rightIcon={
            <button
              type="button"
              aria-label={showConfirm ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
              onClick={() => setShowConfirm(v => !v)}
              className="pointer-events-auto text-[#9ca3af] hover:text-[#6d28d9] transition-colors"
            >
              <EyeIcon open={showConfirm} />
            </button>
          }
          autoComplete="new-password"
          size="lg"
        />

        {/* Terms checkbox */}
        {/* <div className="flex flex-col gap-1">
          <label className="flex items-start gap-3 cursor-pointer select-none">
            <div className="relative mt-0.5 shrink-0">
              <input
                type="checkbox"
                id="register-terms"
                name="agreeTerms"
                checked={form.agreeTerms}
                onChange={handleChange}
                className="sr-only peer"
              />
              <div className="w-4 h-4 rounded-[4px] border-2 border-[rgba(109,40,217,0.35)] bg-white peer-checked:bg-[#7c3aed] peer-checked:border-[#7c3aed] transition-all flex items-center justify-center">
                {form.agreeTerms && (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 12" fill="white" className="w-2.5 h-2.5">
                    <path fillRule="evenodd" d="M10.543 2.457a.75.75 0 0 1 0 1.086L5 9.086 1.457 5.543a.75.75 0 1 1 1.086-1.086L5 6.914l4.457-4.457a.75.75 0 0 1 1.086 0Z" clipRule="evenodd" />
                  </svg>
                )}
              </div>
            </div>
            <span className="text-sm text-[#6b7280] leading-snug">
              Tôi đồng ý với{' '}
              <Link to="/terms" className="text-[#7c3aed] font-medium hover:underline">
                Điều khoản dịch vụ
              </Link>{' '}
              và{' '}
              <Link to="/privacy" className="text-[#7c3aed] font-medium hover:underline">
                Chính sách bảo mật
              </Link>
            </span>
          </label>
          {errors.agreeTerms && (
            <p className="text-xs text-[#dc2626] pl-7">{errors.agreeTerms}</p>
          )}
        </div> */}

        <Button
          type="submit"
          variant="primary"
          size="lg"
          fullWidth
          loading={loading}
          className="mt-2 bg-gradient-to-r from-[#7c3aed] to-[#4f46e5] hover:from-[#6d28d9] hover:to-[#4338ca] shadow-lg shadow-[#7c3aed]/30 border-0"
        >
          Tạo tài khoản
        </Button>
      </form>
    </AuthCard>
  )
}
