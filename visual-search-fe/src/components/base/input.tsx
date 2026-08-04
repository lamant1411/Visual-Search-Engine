import React, { useState } from 'react'

type InputSize = 'sm' | 'md' | 'lg'
type InputVariant = 'default' | 'filled' | 'ghost'

interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string
  helperText?: string
  errorMessage?: string
  leftIcon?: React.ReactNode
  rightIcon?: React.ReactNode
  size?: InputSize
  variant?: InputVariant
  fullWidth?: boolean
}

const sizeClasses: Record<InputSize, { input: string; icon: string }> = {
  sm: { input: 'h-8 text-xs px-3',  icon: 'w-4 h-4' },
  md: { input: 'h-10 text-sm px-4', icon: 'w-4 h-4' },
  lg: { input: 'h-12 text-base px-5', icon: 'w-5 h-5' },
}

const variantBase: Record<InputVariant, string> = {
  default: 'bg-white border border-[rgba(109,40,217,0.2)]',
  filled:  'bg-[#f3f0ff] border border-transparent',
  ghost:   'bg-transparent border-b border-[rgba(109,40,217,0.3)] rounded-none',
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, helperText, errorMessage, leftIcon, rightIcon, size = 'md', variant = 'default', fullWidth = true, className = '', disabled, id, ...props }, ref) => {
    const [focused, setFocused] = useState(false)
    const hasError = !!errorMessage
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-')

    const borderColor = hasError
      ? '!border-[#dc2626]'
      : focused
      ? '!border-[#6d28d9]'
      : ''

    return (
      <div className={`flex flex-col gap-1.5 ${fullWidth ? 'w-full' : ''}`}>
        {label && (
          <label
            htmlFor={inputId}
            className={`text-xs font-semibold transition-colors duration-200 ${
              hasError ? 'text-[#dc2626]' : focused ? 'text-[#6d28d9]' : 'text-[#4b5563]'
            }`}
          >
            {label}
          </label>
        )}

        <div className="relative flex items-center">
          {leftIcon && (
            <span className={`absolute left-3 text-[#9ca3af] pointer-events-none z-10 ${sizeClasses[size].icon}`}>
              {leftIcon}
            </span>
          )}
          <input
            ref={ref}
            id={inputId}
            disabled={disabled}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            className={[
              'w-full rounded-[10px] text-[#1e1b4b] placeholder:text-[#9ca3af]',
              'outline-none transition-all duration-200',
              'disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-[#f9fafb]',
              'focus:shadow-[0_0_0_3px_rgba(109,40,217,0.15)]',
              variantBase[variant],
              borderColor,
              sizeClasses[size].input,
              leftIcon  ? 'pl-10' : '',
              rightIcon ? 'pr-10' : '',
              className,
            ].filter(Boolean).join(' ')}
            {...props}
          />
          {rightIcon && (
            <span className={`absolute right-3 text-[#9ca3af] pointer-events-none z-10 ${sizeClasses[size].icon}`}>
              {rightIcon}
            </span>
          )}
        </div>

        {(helperText || errorMessage) && (
          <p className={`text-xs ${hasError ? 'text-[#dc2626]' : 'text-[#9ca3af]'}`}>
            {errorMessage ?? helperText}
          </p>
        )}
      </div>
    )
  },
)
Input.displayName = 'Input'

// --- Textarea ---
interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  helperText?: string
  errorMessage?: string
  fullWidth?: boolean
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, helperText, errorMessage, fullWidth = true, className = '', id, ...props }, ref) => {
    const [focused, setFocused] = useState(false)
    const hasError = !!errorMessage
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-')

    return (
      <div className={`flex flex-col gap-1.5 ${fullWidth ? 'w-full' : ''}`}>
        {label && (
          <label
            htmlFor={inputId}
            className={`text-xs font-semibold transition-colors duration-200 ${
              hasError ? 'text-[#dc2626]' : focused ? 'text-[#6d28d9]' : 'text-[#4b5563]'
            }`}
          >
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={inputId}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          className={[
            'w-full rounded-[10px] px-4 py-3 text-sm text-[#1e1b4b] placeholder:text-[#9ca3af]',
            'bg-white border outline-none resize-y min-h-[100px]',
            'transition-all duration-200 focus:shadow-[0_0_0_3px_rgba(109,40,217,0.15)]',
            hasError ? 'border-[#dc2626]' : focused ? 'border-[#6d28d9]' : 'border-[rgba(109,40,217,0.2)]',
            className,
          ].filter(Boolean).join(' ')}
          {...props}
        />
        {(helperText || errorMessage) && (
          <p className={`text-xs ${hasError ? 'text-[#dc2626]' : 'text-[#9ca3af]'}`}>
            {errorMessage ?? helperText}
          </p>
        )}
      </div>
    )
  },
)
Textarea.displayName = 'Textarea'

export default Input
