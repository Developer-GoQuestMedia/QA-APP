'use client'

import React, { ButtonHTMLAttributes, useEffect } from 'react'
import { lightTheme, logThemeUsage } from '@/app/styles/theme'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'success'
  size?: 'sm' | 'md' | 'lg'
}

const buttonStyles = {
  base: `
    inline-flex items-center justify-center
    border border-transparent
    rounded-${lightTheme.borderRadius.default}
    font-${lightTheme.typography.weights.medium}
    transition-all ${lightTheme.transitions.default}
    focus:outline-none focus:ring-2 focus:ring-offset-2
  `,
  variants: {
    primary: {
      bg: `bg-${lightTheme.colors.accent.primary} hover:bg-${lightTheme.colors.accent.hover}`,
      text: `text-${lightTheme.colors.background.primary}`,
      ring: `focus:ring-${lightTheme.colors.accent.focus}`
    },
    secondary: {
      bg: `bg-${lightTheme.colors.text.tertiary} hover:bg-${lightTheme.colors.text.secondary}`,
      text: `text-${lightTheme.colors.background.primary}`,
      ring: `focus:ring-${lightTheme.colors.text.secondary}`
    },
    danger: {
      bg: `bg-${lightTheme.colors.status.error} hover:bg-${lightTheme.colors.status.error}/90`,
      text: `text-${lightTheme.colors.background.primary}`,
      ring: `focus:ring-${lightTheme.colors.status.error}`
    },
    success: {
      bg: `bg-${lightTheme.colors.status.success} hover:bg-${lightTheme.colors.status.success}/90`,
      text: `text-${lightTheme.colors.background.primary}`,
      ring: `focus:ring-${lightTheme.colors.status.success}`
    }
  },
  sizes: {
    sm: `px-${lightTheme.spacing[2]} py-${lightTheme.spacing[1]} text-${lightTheme.typography.sizes.sm}`,
    md: `px-${lightTheme.spacing[4]} py-${lightTheme.spacing[2]} text-${lightTheme.typography.sizes.base}`,
    lg: `px-${lightTheme.spacing[6]} py-${lightTheme.spacing[3]} text-${lightTheme.typography.sizes.lg}`
  }
}

export default function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  children,
  onClick,
  ...props
}: ButtonProps) {
  useEffect(() => {
    logThemeUsage('Button', {
      variant,
      size,
      appliedStyles: {
        base: buttonStyles.base,
        variant: buttonStyles.variants[variant],
        size: buttonStyles.sizes[size],
        custom: className
      }
    })
  }, [variant, size, className])

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    logThemeUsage('Button', {
      event: 'click',
      variant,
      size,
      styles: {
        variant: buttonStyles.variants[variant],
        size: buttonStyles.sizes[size]
      }
    })
    onClick?.(e)
  }

  const variantStyle = buttonStyles.variants[variant]
  const sizeStyle = buttonStyles.sizes[size]

  return (
    <button
      className={`
        ${buttonStyles.base}
        ${variantStyle.bg}
        ${variantStyle.text}
        ${variantStyle.ring}
        ${sizeStyle}
        ${className}
      `}
      onClick={handleClick}
      {...props}
    >
      {children}
    </button>
  )
} 