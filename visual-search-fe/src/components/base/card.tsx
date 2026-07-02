import React from 'react'

type CardVariant = 'default' | 'elevated' | 'outlined' | 'glass'

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant
  hoverable?: boolean
  padding?: 'none' | 'sm' | 'md' | 'lg'
  children?: React.ReactNode
}

const variantClasses: Record<CardVariant, string> = {
  default:  'bg-white shadow-sm shadow-[#6d28d9]/8 border border-[rgba(109,40,217,0.1)]',
  elevated: 'bg-white shadow-lg shadow-[#6d28d9]/10 border border-[rgba(109,40,217,0.12)]',
  outlined: 'bg-transparent border border-[rgba(109,40,217,0.25)]',
  glass:    'bg-white/70 backdrop-blur-xl border border-white/80 shadow-lg shadow-[#6d28d9]/8',
}

const paddingClasses = {
  none: '',
  sm:   'p-3',
  md:   'p-5',
  lg:   'p-8',
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ variant = 'default', hoverable = false, padding = 'md', children, className = '', ...props }, ref) => (
    <div
      ref={ref}
      className={[
        'rounded-[16px] overflow-hidden',
        variantClasses[variant],
        paddingClasses[padding],
        hoverable
          ? 'transition-all duration-300 cursor-pointer hover:-translate-y-1 hover:shadow-xl hover:shadow-[#6d28d9]/15'
          : '',
        className,
      ].filter(Boolean).join(' ')}
      {...props}
    >
      {children}
    </div>
  ),
)
Card.displayName = 'Card'

interface CardSectionProps extends React.HTMLAttributes<HTMLDivElement> {
  children?: React.ReactNode
}

export const CardHeader: React.FC<CardSectionProps> = ({ children, className = '', ...props }) => (
  <div className={`mb-4 ${className}`} {...props}>{children}</div>
)

export const CardBody: React.FC<CardSectionProps> = ({ children, className = '', ...props }) => (
  <div className={className} {...props}>{children}</div>
)

export const CardFooter: React.FC<CardSectionProps> = ({ children, className = '', ...props }) => (
  <div className={`mt-4 pt-4 border-t border-[rgba(109,40,217,0.1)] ${className}`} {...props}>
    {children}
  </div>
)

export default Card
