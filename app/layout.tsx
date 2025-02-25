import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { AuthProvider } from './components/AuthProvider'
import Navigation from '@/components/Navigation'
import { Providers } from './providers'
import SystemInit from '@/components/SystemInit'
import { Toaster } from 'react-hot-toast'
import SpeedInsightsClient from './components/SpeedInsightsClient'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'QA App',
  description: 'Quality Assurance Application',
  icons: {
    icon: [
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
      {
        url: '/icon-32x32.png',
        sizes: '32x32',
        type: 'image/png',
      },
      {
        url: '/icon-16x16.png',
        sizes: '16x16',
        type: 'image/png',
      }
    ],
    apple: [
      { url: '/apple-touch-icon.png' }
    ],
  }
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                let theme = sessionStorage.getItem('theme') || localStorage.getItem('theme')
                if (!theme) {
                  sessionStorage.setItem('theme', 'dark')
                  theme = 'dark'
                }
                if (theme === 'dark') {
                  document.documentElement.classList.add('dark')
                }
                // Migrate theme from localStorage if it exists
                if (localStorage.getItem('theme')) {
                  sessionStorage.setItem('theme', localStorage.getItem('theme'))
                  localStorage.removeItem('theme')
                }
              } catch (e) {}
            `,
          }}
        />
        <AuthProvider>
          <Navigation />
          <main>
            <Providers>
              <SystemInit />
              {children}
              <Toaster position="bottom-right" />
            </Providers>
          </main>
        </AuthProvider>
        <SpeedInsightsClient />
      </body>
    </html>
  )
}

