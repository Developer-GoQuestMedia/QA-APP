'use client'

import React, { ReactNode, useEffect } from 'react'
import { lightTheme, logThemeUsage } from '@/app/styles/theme'

interface CardProps {
  children: ReactNode
  title?: string
  className?: string
  headerAction?: ReactNode
  onClick?: () => void
}

const cardStyles = {
  base: `
    bg-${lightTheme.colors.background.primary}
    rounded-${lightTheme.borderRadius.lg}
    ${lightTheme.shadows.md}
    overflow-hidden
    transition-all ${lightTheme.transitions.default}
  `,
  header: {
    wrapper: `
      px-${lightTheme.spacing[6]}
      py-${lightTheme.spacing[4]}
      border-b border-${lightTheme.colors.border.light}
      flex justify-between items-center
      bg-${lightTheme.colors.background.secondary}
    `,
    title: `
      text-${lightTheme.typography.sizes.lg}
      font-${lightTheme.typography.weights.medium}
      text-${lightTheme.colors.text.primary}
      leading-${lightTheme.typography.lineHeights.normal}
    `
  },
  content: `
    px-${lightTheme.spacing[6]}
    py-${lightTheme.spacing[4]}
  `,
  interactive: `
    cursor-pointer
    hover:${lightTheme.shadows.lg}
    active:${lightTheme.shadows.sm}
    focus:outline-none
    focus:ring-2
    focus:ring-${lightTheme.colors.accent.focus}
    focus:ring-offset-2
  `
}

export default function Card({ children, title, className = '', headerAction, onClick }: CardProps) {
  useEffect(() => {
    logThemeUsage('Card', {
      hasTitle: !!title,
      hasHeaderAction: !!headerAction,
      isClickable: !!onClick,
      appliedStyles: {
        base: cardStyles.base,
        header: cardStyles.header,
        content: cardStyles.content,
        interactive: onClick ? cardStyles.interactive : '',
        customClass: className
      }
    })
  }, [title, headerAction, onClick, className])

  const handleClick = () => {
    if (onClick) {
      logThemeUsage('Card', {
        event: 'click',
        styles: {
          base: cardStyles.base,
          interactive: cardStyles.interactive
        }
      })
      onClick()
    }
  }

  return (
    <div 
      className={`
        ${cardStyles.base}
        ${onClick ? cardStyles.interactive : ''}
        ${className}
      `}
      onClick={handleClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      {(title || headerAction) && (
        <div className={cardStyles.header.wrapper}>
          {title && (
            <h3 className={cardStyles.header.title}>{title}</h3>
          )}
          {headerAction && <div>{headerAction}</div>}
        </div>
      )}
      <div className={cardStyles.content}>
        {children}
      </div>
    </div>
  )
} 