'use client'

import { useAuth } from '@/context/AuthContext'
import { UserRole } from '@/lib/types'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

interface RouteGuardProps {
    children: React.ReactNode
    allowedRoles: UserRole[]
}

export default function RouteGuard({ children, allowedRoles }: RouteGuardProps) {
    const { user, isAuthenticated, isLoading } = useAuth()
    const router = useRouter()

    useEffect(() => {
        if (isLoading) return

        if (!isAuthenticated) {
            router.push('/login')
            return
        }

        if (user && !user.roles.some((r) => allowedRoles.includes(r))) {
            // Redirect to the appropriate page for their role
            if (user.roles.includes('administrator')) {
                router.push('/admin')
            } else if (user.roles.includes('observer')) {
                router.push('/dashboard')
            } else {
                router.push('/chat')
            }
        }
    }, [isAuthenticated, isLoading, user, allowedRoles, router])

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-950 to-slate-900">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-10 h-10 border-4 border-purple-400 border-t-transparent rounded-full animate-spin" />
                    <p className="text-purple-200 text-sm font-medium">Loading...</p>
                </div>
            </div>
        )
    }

    if (!isAuthenticated) {
        return null // Will redirect via useEffect
    }

    const hasRequiredRole = user?.roles.some((r) => allowedRoles.includes(r))

    if (!hasRequiredRole) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-900 text-white p-6">
                <div className="max-w-md w-full bg-slate-800 rounded-xl p-8 border border-slate-700 shadow-2xl text-center">
                    <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                        <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                    </div>
                    <h2 className="text-2xl font-bold mb-2">Access Denied</h2>
                    <p className="text-slate-400 mb-8">
                        You do not have the required permissions to view this page.
                        Your current roles: <span className="text-purple-400 font-mono">[{user?.roles.join(', ') || 'none'}]</span>
                    </p>
                    <div className="space-y-3">
                        <button
                            onClick={() => router.push('/login')}
                            className="w-full py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
                        >
                            Back to Login
                        </button>
                    </div>
                </div>
            </div>
        )
    }

    return <>{children}</>
}
