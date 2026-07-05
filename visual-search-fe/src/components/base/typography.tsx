import React from 'react'

type TypographyVariant =
    | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'
    | 'body-lg' | 'body-md' | 'body-sm'
    | 'caption' | 'label' | 'overline'

type TypographyColor = 'primary' | 'secondary' | 'muted' | 'accent' | 'success' | 'warning' | 'error' | 'inherit'

interface TypographyProps {
    variant?: TypographyVariant
    color?: TypographyColor
    gradient?: boolean
    truncate?: boolean
    as?: keyof React.JSX.IntrinsicElements
    className?: string
    children?: React.ReactNode
}

const variantClasses: Record<TypographyVariant, string> = {
    h1: 'text-5xl font-extrabold leading-tight tracking-tight',
    h2: 'text-4xl font-bold leading-tight tracking-tight',
    h3: 'text-3xl font-bold leading-snug',
    h4: 'text-2xl font-semibold leading-snug',
    h5: 'text-xl font-semibold leading-normal',
    h6: 'text-lg font-semibold leading-normal',
    'body-lg': 'text-base font-normal leading-relaxed',
    'body-md': 'text-sm font-normal leading-relaxed',
    'body-sm': 'text-xs font-normal leading-relaxed',
    caption: 'text-xs font-medium leading-normal',
    label: 'text-sm font-medium leading-none',
    overline: 'text-xs font-semibold uppercase tracking-widest leading-none',
}

const defaultTags: Record<TypographyVariant, keyof React.JSX.IntrinsicElements> = {
    h1: 'h1', h2: 'h2', h3: 'h3', h4: 'h4', h5: 'h5', h6: 'h6',
    'body-lg': 'p', 'body-md': 'p', 'body-sm': 'p',
    caption: 'span', label: 'span', overline: 'span',
}

const colorClasses: Record<TypographyColor, string> = {
    primary: 'text-slate-900', // Đảm bảo chữ luôn hiển thị màu tối đậm
    secondary: 'text-slate-600',
    muted: 'text-slate-400',
    accent: 'text-blue-600',
    success: 'text-green-600',
    warning: 'text-amber-600',
    error: 'text-red-600',
    inherit: 'text-inherit',
}

export const Typography: React.FC<TypographyProps> = ({
    variant = 'body-md',
    color = 'primary',
    gradient = false,
    truncate = false,
    as,
    className = '',
    children,
}) => {
    const Tag = (as ?? defaultTags[variant]) as React.ElementType

    // 2. Bỏ tiền tố dark: ở phần gradient
    const gradientClass = gradient
        ? 'bg-gradient-to-r from-blue-600 to-blue-400 bg-clip-text text-transparent'
        : ''

    return (
        <Tag
            className={[
                variantClasses[variant],
                gradient ? gradientClass : colorClasses[color],
                truncate ? 'truncate' : '',
                'transition-colors duration-200',
                className,
            ].filter(Boolean).join(' ')}
        >
            {children}
        </Tag>
    )
}

export default Typography