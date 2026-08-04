import React from 'react'

type LoaderSize = 'sm' | 'md' | 'lg' | 'xl'
type LoaderVariant = 'spinner' | 'dots' | 'pulse' | 'skeleton'

interface LoaderProps {
  variant?: LoaderVariant
  size?: LoaderSize
  text?: string
  fullScreen?: boolean
  className?: string
}

const sizeMap: Record<LoaderSize, number> = { sm: 16, md: 24, lg: 40, xl: 56 }

const SpinnerLoader: React.FC<{ size: LoaderSize }> = ({ size }) => {
  const px = sizeMap[size]
  return (
    <svg width={px} height={px} viewBox="0 0 24 24" fill="none" className="animate-spin text-blue-600">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.15" strokeWidth="3" />
      <path d="M12 2a10 10 0 0110 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

const DotsLoader: React.FC<{ size: LoaderSize }> = ({ size }) => {
  const dotSize = size === 'sm' ? 'w-1.5 h-1.5' : size === 'md' ? 'w-2 h-2' : 'w-3 h-3'
  return (
    <div className="flex items-center gap-1.5">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className={`${dotSize} rounded-full bg-blue-600 animate-bounce`}
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </div>
  )
}

const PulseLoader: React.FC<{ size: LoaderSize }> = ({ size }) => {
  const px = sizeMap[size]
  return (
    <div className="relative flex items-center justify-center">
      <div
        className="absolute rounded-full bg-blue-600/20 animate-ping"
        style={{ width: px, height: px }}
      />
      <div className="rounded-full bg-blue-600" style={{ width: px * 0.5, height: px * 0.5 }} />
    </div>
  )
}

// --- Skeleton ---
interface SkeletonProps {
  width?: string | number
  height?: string | number
  rounded?: boolean
  className?: string
  lines?: number
}

export const Skeleton: React.FC<SkeletonProps> = ({
  width = '100%',
  height = 16,
  rounded = false,
  lines = 1,
  className = '',
}) => (
  <div className={`flex flex-col gap-2 ${className}`}>
    {Array.from({ length: lines }).map((_, i) => (
      <div
        key={i}
        style={{
          width: i === lines - 1 && lines > 1 ? '70%' : width,
          height,
          borderRadius: rounded ? 9999 : 8,
          // Sử dụng tone xám Slate cho mượt mà (slate-100 -> slate-200 -> slate-100)
          background: 'linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%)',
          backgroundSize: '200% 100%',
          animation: 'shimmer 1.5s linear infinite',
        }}
      />
    ))}
    <style>{`
      @keyframes shimmer {
        0%   { background-position: 200% 0; }
        100% { background-position: -200% 0; }
      }
    `}</style>
  </div>
)

export const Loader: React.FC<LoaderProps> = ({
  variant = 'spinner',
  size = 'md',
  text,
  fullScreen = false,
  className = '',
}) => {
  const inner = (
    <div className={`flex flex-col items-center justify-center gap-3 ${className}`}>
      {variant === 'spinner' && <SpinnerLoader size={size} />}
      {variant === 'dots' && <DotsLoader size={size} />}
      {variant === 'pulse' && <PulseLoader size={size} />}
      {text && <p className="text-sm text-slate-600">{text}</p>}
    </div>
  )

  if (fullScreen) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/80 backdrop-blur-sm">
        {inner}
      </div>
    )
  }
  return inner
}

export default Loader