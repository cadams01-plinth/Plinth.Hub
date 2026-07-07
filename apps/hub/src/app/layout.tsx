import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Plinth Hub',
  description:
    'One account for the Plinth Resource suite — projects, documents and apps for infrastructure teams.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB">
      <body>{children}</body>
    </html>
  )
}
