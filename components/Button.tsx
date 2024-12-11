'use client'

import React, { ButtonHTMLAttributes } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'success'
  size?: 'sm' | 'md' | 'lg'
}

const variantClasses = {
  primary: 'bg-blue-600 hover:bg-blue-700 text-white',
  secondary: 'bg-gray-600 hover:bg-gray-700 text-white',
  danger: 'bg-red-600 hover:bg-red-700 text-white',
  success: 'bg-green-600 hover:bg-green-700 text-white'
}

const sizeClasses = {
  sm: 'px-2 py-1 text-sm',
  md: 'px-4 py-2',
  lg: 'px-6 py-3 text-lg'
}

export default function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  children,
  ...props
}: ButtonProps) {
  const baseClasses = 'inline-flex items-center justify-center border border-transparent rounded-md font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors duration-200'
  const variantClass = variantClasses[variant]
  const sizeClass = sizeClasses[size]
  const focusRingColor = `focus:ring-${variant === 'primary' ? 'blue' : variant === 'secondary' ? 'gray' : variant === 'danger' ? 'red' : 'green'}-500`

  return (
    <button
      className={`${baseClasses} ${variantClass} ${sizeClass} ${focusRingColor} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
} 