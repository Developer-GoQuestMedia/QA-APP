import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Unauthorized Access',
  description: 'You do not have permission to access this resource'
}

export default function UnauthorizedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
} 