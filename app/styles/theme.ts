export const lightTheme = {
  colors: {
    background: {
      primary: '#ffffff',
      secondary: '#f9fafb',
      tertiary: '#f3f4f6'
    },
    text: {
      primary: '#111827',
      secondary: '#374151',
      tertiary: '#6b7280'
    },
    accent: {
      primary: '#2563eb',
      hover: '#1d4ed8',
      focus: '#3b82f6'
    },
    border: {
      light: '#e5e7eb',
      default: '#d1d5db',
      dark: '#9ca3af'
    },
    status: {
      success: '#22c55e',
      error: '#ef4444',
      warning: '#f59e0b',
      info: '#3b82f6'
    }
  },
  spacing: {
    0: '0px',
    1: '0.25rem',
    2: '0.5rem',
    3: '0.75rem',
    4: '1rem',
    5: '1.25rem',
    6: '1.5rem',
    8: '2rem',
    10: '2.5rem',
    12: '3rem',
    16: '4rem'
  },
  borderRadius: {
    none: '0px',
    sm: '0.125rem',
    default: '0.25rem',
    md: '0.375rem',
    lg: '0.5rem',
    xl: '0.75rem',
    '2xl': '1rem',
    full: '9999px'
  },
  typography: {
    fonts: {
      sans: 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
      mono: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
    },
    sizes: {
      xs: '0.75rem',
      sm: '0.875rem',
      base: '1rem',
      lg: '1.125rem',
      xl: '1.25rem',
      '2xl': '1.5rem',
      '3xl': '1.875rem',
      '4xl': '2.25rem'
    },
    weights: {
      normal: '400',
      medium: '500',
      semibold: '600',
      bold: '700'
    },
    lineHeights: {
      none: '1',
      tight: '1.25',
      normal: '1.5',
      relaxed: '1.75'
    }
  },
  shadows: {
    none: 'none',
    sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
    default: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1)',
    md: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)',
    lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1)',
    xl: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)'
  },
  transitions: {
    default: '150ms cubic-bezier(0.4, 0, 0.2, 1)',
    fast: '100ms cubic-bezier(0.4, 0, 0.2, 1)',
    slow: '300ms cubic-bezier(0.4, 0, 0.2, 1)'
  }
} as const;

export type Theme = typeof lightTheme;

// Type-safe utility functions
export const styleUtils = {
  getColor: (path: keyof Theme['colors']) => lightTheme.colors[path],
  getSpacing: (size: keyof Theme['spacing']) => lightTheme.spacing[size],
  getRadius: (size: keyof Theme['borderRadius']) => lightTheme.borderRadius[size],
  getShadow: (size: keyof Theme['shadows']) => lightTheme.shadows[size],
  getFontSize: (size: keyof Theme['typography']['sizes']) => lightTheme.typography.sizes[size],
  getFontWeight: (weight: keyof Theme['typography']['weights']) => lightTheme.typography.weights[weight],
  getLineHeight: (height: keyof Theme['typography']['lineHeights']) => lightTheme.typography.lineHeights[height],
  getTransition: (speed: keyof Theme['transitions']) => lightTheme.transitions[speed]
};

// Logging utility
export const logThemeUsage = (component: string, styles: Record<string, unknown>) => {
  console.log(`Theme Usage - ${component}:`, {
    timestamp: new Date().toISOString(),
    component,
    appliedStyles: styles,
    themeTokens: {
      colors: Object.keys(lightTheme.colors),
      spacing: Object.keys(lightTheme.spacing),
      borderRadius: Object.keys(lightTheme.borderRadius),
      typography: {
        sizes: Object.keys(lightTheme.typography.sizes),
        weights: Object.keys(lightTheme.typography.weights),
        lineHeights: Object.keys(lightTheme.typography.lineHeights)
      },
      shadows: Object.keys(lightTheme.shadows),
      transitions: Object.keys(lightTheme.transitions)
    }
  });
}; 