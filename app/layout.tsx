import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Providers } from './providers'
import Script from 'next/script'

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
    <html lang="en" className="dark">
      <head>
        <Script id="theme-switcher" strategy="beforeInteractive">
          {`
            try {
              let theme = localStorage.getItem('theme')
              if (!theme) {
                localStorage.setItem('theme', 'dark')
                theme = 'dark'
              }
              document.documentElement.classList.toggle('dark', theme === 'dark')
            } catch (e) {}
          `}
        </Script>
      </head>
      <body className={inter.className}>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  )
}

