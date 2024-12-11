'use client'

import React, { ReactNode } from 'react'

interface CardProps {
  children: ReactNode
  title?: string
  className?: string
  headerAction?: ReactNode
  onClick?: () => void
}

export default function Card({ children, title, className = '', headerAction, onClick }: CardProps) {
  return (
    <div 
      className={`bg-white rounded-lg shadow-md overflow-hidden ${className}`}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      {(title || headerAction) && (
        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
          {title && <h3 className="text-lg font-medium text-gray-900">{title}</h3>}
          {headerAction && <div>{headerAction}</div>}
        </div>
      )}
      <div className="px-6 py-4">
        {children}
      </div>
    </div>
  )
} 