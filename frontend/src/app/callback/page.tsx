'use client'

import { useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { Shield, Loader2 } from 'lucide-react'

export default function CallbackPage() {
    const searchParams = useSearchParams()
    const router = useRouter()
    const { loginWithCode, error } = useAuth()
    const effectRan = useRef(false)

    useEffect(() => {
        // Prevent double execution in dev mode
        if (effectRan.current) return
        effectRan.current = true

        const token = searchParams.get('token')

        if (token) {
            console.log('Detected OAuth token, exchanging...')
            loginWithCode(token)
                .then(() => {
                    // Success is handled in loginWithCode via router.push
                })
                .catch((err) => {
                    console.error('Callback error:', err)
                    // Error is handled in context
                })
        } else {
            console.error('No token found in URL')
            router.push('/login?error=no_token')
        }
    }, [searchParams, loginWithCode, router])

    return (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6">
            <div className="max-w-md w-full bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-10 text-center">
                <div className="w-16 h-16 bg-purple-500/20 rounded-2xl flex items-center justify-center mx-auto mb-6">
                    <Shield className="w-8 h-8 text-purple-400" />
                </div>

                <h1 className="text-2xl font-bold text-white mb-2">Authenticating</h1>
                <p className="text-purple-200/60 mb-8">Completing secure OAuth 2.0 handshake...</p>

                <div className="flex justify-center">
                    <Loader2 className="w-8 h-8 text-purple-500 animate-spin" />
                </div>

                {error && (
                    <div className="mt-8 p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
                        <p className="text-red-400 text-sm mb-4">{error}</p>
                        <button
                            onClick={() => router.push('/login')}
                            className="text-white bg-red-500/20 hover:bg-red-500/30 px-4 py-2 rounded-lg text-sm transition-colors"
                        >
                            Return to Login
                        </button>
                    </div>
                )}
            </div>
        </div>
    )
}
