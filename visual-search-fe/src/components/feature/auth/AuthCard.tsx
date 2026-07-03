import React from 'react'

interface AuthCardProps {
  /** Logo / icon ở đầu trang (tuỳ chọn) */
  logo?: React.ReactNode
  /** Tiêu đề chính */
  title: string
  /** Mô tả ngắn dưới tiêu đề */
  subtitle?: string
  /** Nội dung form */
  children: React.ReactNode
  /** Link ở cuối card (vd: "Chưa có tài khoản? Đăng ký") */
  footer?: React.ReactNode
}

/**
 * Card bọc nội dung form auth (login / register).
 * Sử dụng glassmorphism style nhất quán với design system.
 */
export function AuthCard({ logo, title, subtitle, children, footer }: AuthCardProps) {
  return (
    <div className="mx-auto w-full max-w-md">
      {/* Card */}
      <div className="rounded-[24px] bg-white/80 backdrop-blur-xl border border-white/90 shadow-xl shadow-[#6d28d9]/10 px-8 py-10">
        {/* Logo */}
        {logo && <div className="flex justify-center mb-6">{logo}</div>}

        {/* Heading */}
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-[#1e1b4b] leading-tight">{title}</h1>
          {subtitle && (
            <p className="mt-2 text-sm text-[#6b7280]">{subtitle}</p>
          )}
        </div>

        {/* Form content */}
        <div>{children}</div>

        {/* Footer link */}
        {footer && (
          <div className="mt-6 text-center text-sm text-[#6b7280]">{footer}</div>
        )}
      </div>
    </div>
  )
}
