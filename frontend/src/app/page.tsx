'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function Home() {
  const router = useRouter()

  useEffect(() => {
    // Check if user is already authenticated
    const token = localStorage.getItem('lr_access_token')
    const user = localStorage.getItem('lr_user')

    if (token && user) {
      try {
        const parsed = JSON.parse(user)
        const roles = parsed.roles || []

        if (roles.includes('administrator')) {
          router.push('/admin')
        } else if (roles.includes('observer')) {
          router.push('/dashboard')
        } else {
          router.push('/chat')
        }
      } catch {
        router.push('/login')
      }
    } else {
      router.push('/login')
    }
  }, [router])

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-900 via-purple-950 to-slate-900">
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 border-4 border-purple-400 border-t-transparent rounded-full animate-spin" />
        <p className="text-purple-200 text-sm font-medium">Redirecting...</p>
      </div>
    </div>
  )
}
