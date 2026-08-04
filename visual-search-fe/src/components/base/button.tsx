import React from 'react'

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger'
type ButtonSize = 'sm' | 'md' | 'lg' | 'icon'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: ButtonVariant
    size?: ButtonSize
    loading?: boolean
    leftIcon?: React.ReactNode
    rightIcon?: React.ReactNode
    fullWidth?: boolean
    children?: React.ReactNode
}

const variantClasses: Record<ButtonVariant, string> = {
    primary:
        'bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white shadow-sm shadow-blue-500/30',
    secondary:
        'bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-900 shadow-sm',
    outline:
        'border border-slate-300 text-slate-700 hover:text-slate-900 hover:bg-slate-50 active:bg-slate-100 bg-transparent',
    ghost:
        'text-slate-600 hover:text-slate-900 hover:bg-slate-100 active:bg-slate-200 bg-transparent',
    danger:
        'bg-red-600 hover:bg-red-700 active:bg-red-800 text-white shadow-sm shadow-red-500/30',
}

const sizeClasses: Record<ButtonSize, string> = {
    sm: 'px-3 py-1.5 text-xs h-8 gap-1.5',
    md: 'px-4 py-2 text-sm h-10 gap-2',
    lg: 'px-6 py-3 text-base h-12 gap-2.5',
    icon: 'w-10 h-10 p-0 justify-center',
}

const Spinner = () => (
    <svg className="animate-spin w-4 h-4 shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
)

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({ variant = 'primary', size = 'md', loading = false, leftIcon, rightIcon, fullWidth = false, disabled, children, className = '', ...props }, ref) => {
        const isDisabled = disabled || loading

        // Đổi màu viền focus (ring) tùy theo variant để UI tinh tế hơn
        const ringColor = variant === 'danger' ? 'focus-visible:ring-red-600' : 'focus-visible:ring-blue-600'

        return (
            <button
                ref={ref}
                disabled={isDisabled}
                className={[
                    'inline-flex items-center justify-center font-semibold rounded-[10px]',
                    'transition-all duration-200 ease-in-out cursor-pointer',
                    `focus-visible:outline-none focus-visible:ring-2 ${ringColor} focus-visible:ring-offset-2 focus-visible:ring-offset-white`,
                    'disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none',
                    'select-none',
                    variantClasses[variant],
                    sizeClasses[size],
                    fullWidth ? 'w-full' : '',
                    className,
                ].filter(Boolean).join(' ')}
                {...props}
            >
                {loading ? <Spinner /> : leftIcon ? <span className="shrink-0">{leftIcon}</span> : null}
                {children && <span>{children}</span>}
                {!loading && rightIcon && <span className="shrink-0">{rightIcon}</span>}
            </button>
        )
    },
)

Button.displayName = 'Button'
export default Button