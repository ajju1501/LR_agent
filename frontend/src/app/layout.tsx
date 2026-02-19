import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import '@/styles/globals.css'
import React from 'react'
import { AuthProvider } from '@/context/AuthContext'
import { OrgProvider } from '@/context/OrgContext'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'LoginRadius Chatbot',
  description: 'RAG-based conversational chatbot for LoginRadius documentation',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <AuthProvider>
          <OrgProvider>
            {children}
          </OrgProvider>
        </AuthProvider>
      </body>
    </html>
  )
}
