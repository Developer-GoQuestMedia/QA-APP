import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Providers } from './providers'
import SystemInit from '@/components/SystemInit'
import { Toaster } from 'react-hot-toast'
import SpeedInsightsClient from './components/SpeedInsightsClient'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'QA App',
  description: 'Quality Assurance Application',
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
                let theme = localStorage.getItem('theme')
                if (!theme) {
                  localStorage.setItem('theme', 'dark')
                  theme = 'dark'
                }
                if (theme === 'dark') {
                  document.documentElement.classList.add('dark')
                }
              } catch (e) {}
            `,
          }}
        />
        <Providers>
          <SystemInit />
          {children}
          <Toaster position="bottom-right" />
        </Providers>
        <SpeedInsightsClient />
      </body>
    </html>
  )
}

