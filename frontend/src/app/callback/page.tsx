'use client'

import { Suspense, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { Shield, Loader2 } from 'lucide-react'

function CallbackContent() {
    const searchParams = useSearchParams()
    const router = useRouter()
    const { loginWithOAuthCode, loginWithCode, error } = useAuth()
    const effectRan = useRef(false)

    useEffect(() => {
        // Prevent double execution in dev mode
        if (effectRan.current) return
        effectRan.current = true

        const code = searchParams.get('code')
        const state = searchParams.get('state')
        const token = searchParams.get('token') // Legacy LR redirect

        if (code) {
            // ✅ OAuth 2.0 Authorization Code flow
            console.log('[OAuth] Received authorization code, exchanging...')

            // Verify state to prevent CSRF
            const savedState = sessionStorage.getItem('oauth_state')
            if (savedState && state && savedState !== state) {
                console.error('[OAuth] State mismatch! Possible CSRF attack.')
                router.push('/login?error=state_mismatch')
                return
            }

            // Clean up stored state
            sessionStorage.removeItem('oauth_state')

            loginWithOAuthCode(code, state || '')
                .then(() => {
                    // Success is handled in loginWithOAuthCode via router.push
                })
                .catch((err) => {
                    console.error('[OAuth] Callback error:', err)
                })
        } else if (token) {
            // Legacy: LoginRadius hosted page redirect with token
            console.log('[Legacy] Detected token, exchanging...')
            loginWithCode(token)
                .then(() => {
                    // Success handled in loginWithCode
                })
                .catch((err) => {
                    console.error('[Legacy] Callback error:', err)
                })
        } else {
            console.error('No authorization code or token found in callback URL')
            router.push('/login?error=no_code')
        }
    }, [searchParams, loginWithOAuthCode, loginWithCode, router])

    return (
        <div className="max-w-md w-full bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-10 text-center">
            <div className="w-16 h-16 bg-purple-500/20 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <Shield className="w-8 h-8 text-purple-400" />
            </div>

            <h1 className="text-2xl font-bold text-white mb-2">Authenticating</h1>
            <p className="text-purple-200/60 mb-8">Completing OAuth 2.0 Authorization Code exchange...</p>

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
    )
}

export default function CallbackPage() {
    return (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6">
            <Suspense fallback={
                <div className="max-w-md w-full bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-10 text-center">
                    <div className="flex justify-center">
                        <Loader2 className="w-8 h-8 text-purple-500 animate-spin" />
                    </div>
                    <p className="text-purple-200/60 mt-4">Loading...</p>
                </div>
            }>
                <CallbackContent />
            </Suspense>
        </div>
    )
}
