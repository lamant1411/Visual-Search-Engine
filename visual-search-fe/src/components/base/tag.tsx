import React from 'react'

type TagVariant = 'solid' | 'soft' | 'outline'
type TagColor = 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'neutral'
type TagSize = 'sm' | 'md' | 'lg'

interface TagProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: TagVariant
  color?: TagColor
  size?: TagSize
  removable?: boolean
  onRemove?: () => void
  dot?: boolean
  children?: React.ReactNode
}

const sizeClasses: Record<TagSize, string> = {
  sm: 'text-[10px] px-2 py-0.5 gap-1',
  md: 'text-xs px-2.5 py-1 gap-1.5',
  lg: 'text-sm px-3 py-1.5 gap-2',
}

const variantClasses: Record<TagColor, Record<TagVariant, string>> = {
  primary: {
    solid: 'bg-blue-600 text-white',
    soft: 'bg-blue-100 text-blue-700',
    outline: 'border border-blue-300 text-blue-700 bg-transparent',
  },
  secondary: {
    solid: 'bg-slate-600 text-white',
    soft: 'bg-slate-100 text-slate-700',
    outline: 'border border-slate-300 text-slate-700 bg-transparent',
  },
  success: {
    solid: 'bg-green-600 text-white',
    soft: 'bg-green-100 text-green-700',
    outline: 'border border-green-300 text-green-700 bg-transparent',
  },
  warning: {
    solid: 'bg-amber-500 text-white',
    soft: 'bg-amber-100 text-amber-700',
    outline: 'border border-amber-300 text-amber-700 bg-transparent',
  },
  error: {
    solid: 'bg-red-600 text-white',
    soft: 'bg-red-100 text-red-700',
    outline: 'border border-red-300 text-red-700 bg-transparent',
  },
  neutral: {
    solid: 'bg-slate-500 text-white',
    soft: 'bg-slate-100 text-slate-600',
    outline: 'border border-slate-300 text-slate-600 bg-transparent',
  },
}

const dotClasses: Record<TagColor, Record<TagVariant, string>> = {
  primary: { solid: 'bg-white', soft: 'bg-blue-600', outline: 'bg-blue-600' },
  secondary: { solid: 'bg-white', soft: 'bg-slate-600', outline: 'bg-slate-600' },
  success: { solid: 'bg-white', soft: 'bg-green-600', outline: 'bg-green-600' },
  warning: { solid: 'bg-white', soft: 'bg-amber-500', outline: 'bg-amber-500' },
  error: { solid: 'bg-white', soft: 'bg-red-600', outline: 'bg-red-600' },
  neutral: { solid: 'bg-white', soft: 'bg-slate-500', outline: 'bg-slate-500' },
}

export const Tag: React.FC<TagProps> = ({
  variant = 'soft',
  color = 'primary',
  size = 'md',
  removable = false,
  onRemove,
  dot = false,
  children,
  className = '',
  ...props
}) => {
  const dotSize = size === 'sm' ? 'w-1.5 h-1.5' : 'w-2 h-2'

  return (
    <span
      className={[
        'inline-flex items-center rounded-full font-semibold transition-all duration-200',
        sizeClasses[size],
        variantClasses[color][variant],
        className,
      ].filter(Boolean).join(' ')}
      {...props}
    >
      {dot && (
        <span
          className={`rounded-full shrink-0 ${dotSize} ${dotClasses[color][variant]}`}
        />
      )}

      {children}

      {removable && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onRemove?.() }}
          className="ml-0.5 rounded-full opacity-70 hover:opacity-100 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-current"
          aria-label="Remove tag"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M9 3L3 9M3 3l6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      )}
    </span>
  )
}

export default Tag