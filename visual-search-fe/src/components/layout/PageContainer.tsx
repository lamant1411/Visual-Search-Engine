import type { HTMLAttributes, ReactNode } from 'react';

interface PageContainerProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  /** Trang search/results cần rộng hơn form login → cho phép nới max-width */
  size?: 'narrow' | 'default' | 'wide';
}

const sizeClasses: Record<NonNullable<PageContainerProps['size']>, string> = {
  narrow: 'max-w-md',
  default: 'max-w-4xl',
  wide: 'max-w-6xl',
};

export function PageContainer({
  children,
  size = 'default',
  className = '',
  ...props
}: PageContainerProps) {
  return (
    <div
      className={['mx-auto w-full px-4 py-6', sizeClasses[size], className]
        .filter(Boolean)
        .join(' ')}
      {...props}
    >
      {children}
    </div>
  );
}
