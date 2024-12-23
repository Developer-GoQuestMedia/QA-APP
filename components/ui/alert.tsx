import React from 'react';
import { cn } from '../../utils/cn';

interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'destructive';
  className?: string;
  children: React.ReactNode;
}

export const Alert: React.FC<AlertProps> = ({
  className,
  variant = 'default',
  children,
  ...props
}) => {
  return (
    <div
      role="alert"
      className={cn(
        'rounded-lg border px-4 py-3 text-sm',
        variant === 'default' && 'bg-yellow-50 border-yellow-200 text-yellow-800',
        variant === 'destructive' && 'bg-red-50 border-red-200 text-red-800',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}; 