'use client'

import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react'
import { AuthUser, UserRole } from '@/lib/types'
import { apiClient } from '@/lib/api'
import { useRouter } from 'next/navigation'

interface AuthContextType {
    user: AuthUser | null
    accessToken: string | null
    isAuthenticated: boolean
    isLoading: boolean
    error: string | null
    login: (email: string, password: string) => Promise<void>
    register: (email: string, password: string, firstName: string, lastName: string, username: string) => Promise<void>
    loginWithCode: (token: string) => Promise<void>
    logout: () => void
    hasRole: (role: UserRole) => boolean
    clearError: () => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<AuthUser | null>(null)
    const [accessToken, setAccessToken] = useState<string | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const router = useRouter()

    // Restore session on mount
    useEffect(() => {
        const checkSession = async () => {
            const storedToken = localStorage.getItem('lr_access_token')
            const storedUser = localStorage.getItem('lr_user')

            if (storedToken && storedUser) {
                try {
                    const parsedUser = JSON.parse(storedUser) as AuthUser
                    setAccessToken(storedToken)
                    setUser(parsedUser)

                    // Verify token is still valid and get latest profile/roles
                    try {
                        const profile = await apiClient.getProfile()
                        setUser(profile)
                        localStorage.setItem('lr_user', JSON.stringify(profile))
                    } catch (err) {
                        // Token expired or server error — the interceptor will try to refresh
                        console.error('Session restoration failed:', err)
                        localStorage.removeItem('lr_access_token')
                        localStorage.removeItem('lr_refresh_token')
                        localStorage.removeItem('lr_user')
                        localStorage.removeItem('lr_token_time')
                        setAccessToken(null)
                        setUser(null)
                    }
                } catch {
                    localStorage.removeItem('lr_access_token')
                    localStorage.removeItem('lr_refresh_token')
                    localStorage.removeItem('lr_user')
                    localStorage.removeItem('lr_token_time')
                }
            }
            setIsLoading(false)
        }

        checkSession()
    }, [])

    // Proactive token refresh — refresh every 12 minutes to avoid expiry
    useEffect(() => {
        if (!accessToken) return

        const REFRESH_INTERVAL = 12 * 60 * 1000 // 12 minutes

        const refreshToken = async () => {
            try {
                const currentToken = localStorage.getItem('lr_access_token')
                if (!currentToken) return

                console.log('[Auth] Proactively refreshing token...')
                const response = await fetch(
                    `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'}/api/auth/refresh-token`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ accessToken: currentToken }),
                    }
                )

                if (!response.ok) {
                    console.warn('[Auth] Proactive refresh failed, token may have expired')
                    return
                }

                const data = await response.json()
                const newToken = data.data?.accessToken
                const newRefresh = data.data?.refreshToken

                if (newToken) {
                    localStorage.setItem('lr_access_token', newToken)
                    localStorage.setItem('lr_token_time', Date.now().toString())
                    if (newRefresh) {
                        localStorage.setItem('lr_refresh_token', newRefresh)
                    }
                    setAccessToken(newToken)
                    console.log('[Auth] Token proactively refreshed')
                }
            } catch (err) {
                console.warn('[Auth] Proactive token refresh error:', err)
            }
        }

        // Check if token is old enough to need a refresh right now
        const tokenTime = localStorage.getItem('lr_token_time')
        const elapsed = tokenTime ? Date.now() - parseInt(tokenTime, 10) : REFRESH_INTERVAL
        const initialDelay = Math.max(0, REFRESH_INTERVAL - elapsed)

        // First refresh after remaining time, then every 12 minutes
        const initialTimeout = setTimeout(() => {
            refreshToken()
            // Then set up the recurring interval
            intervalRef = setInterval(refreshToken, REFRESH_INTERVAL)
        }, initialDelay)

        let intervalRef: NodeJS.Timeout | undefined

        return () => {
            clearTimeout(initialTimeout)
            if (intervalRef) clearInterval(intervalRef)
        }
    }, [accessToken])

    const login = useCallback(async (email: string, password: string) => {
        try {
            setIsLoading(true)
            setError(null)

            const result = await apiClient.login(email, password)

            // Store in localStorage
            localStorage.setItem('lr_access_token', result.accessToken)
            localStorage.setItem('lr_token_time', Date.now().toString())
            if (result.refreshToken) {
                localStorage.setItem('lr_refresh_token', result.refreshToken)
            }
            localStorage.setItem('lr_user', JSON.stringify(result.user))

            setAccessToken(result.accessToken)
            setUser(result.user)

            // Redirect based on role
            const roles = result.user.roles
            if (roles.includes('administrator')) {
                router.push('/admin')
            } else if (roles.includes('observer')) {
                router.push('/dashboard')
            } else {
                router.push('/chat')
            }
        } catch (err: any) {
            setError(err.message || 'Login failed')
        } finally {
            setIsLoading(false)
        }
    }, [router])

    const register = useCallback(async (
        email: string,
        password: string,
        firstName: string,
        lastName: string,
        username: string
    ) => {
        try {
            setIsLoading(true)
            setError(null)

            const result = await apiClient.register(email, password, firstName, lastName, username)

            if (result.accessToken) {
                localStorage.setItem('lr_access_token', result.accessToken)
                localStorage.setItem('lr_token_time', Date.now().toString())
                if (result.refreshToken) {
                    localStorage.setItem('lr_refresh_token', result.refreshToken)
                }
                localStorage.setItem('lr_user', JSON.stringify(result.user))
                setAccessToken(result.accessToken)
                setUser(result.user)
                router.push('/chat')
            } else {
                // Email verification required
                setError(result.message || 'Please check your email to verify your account, then login.')
            }
        } catch (err: any) {
            setError(err.message || 'Registration failed')
        } finally {
            setIsLoading(false)
        }
    }, [router])

    const loginWithCode = useCallback(async (token: string) => {
        try {
            setIsLoading(true)
            setError(null)

            const result = await apiClient.exchangeCode(token)

            // Store in localStorage
            localStorage.setItem('lr_access_token', result.accessToken)
            localStorage.setItem('lr_token_time', Date.now().toString())
            if (result.refreshToken) {
                localStorage.setItem('lr_refresh_token', result.refreshToken)
            }
            localStorage.setItem('lr_user', JSON.stringify(result.user))

            setAccessToken(result.accessToken)
            setUser(result.user)

            // Redirect based on role
            const roles = result.user.roles
            if (roles.includes('administrator')) {
                router.push('/admin')
            } else if (roles.includes('observer')) {
                router.push('/dashboard')
            } else {
                router.push('/chat')
            }
        } catch (err: any) {
            setError(err.message || 'OAuth authentication failed')
        } finally {
            setIsLoading(false)
        }
    }, [router])

    const logout = useCallback(() => {
        localStorage.removeItem('lr_access_token')
        localStorage.removeItem('lr_refresh_token')
        localStorage.removeItem('lr_user')
        localStorage.removeItem('lr_token_time')
        setAccessToken(null)
        setUser(null)
        router.push('/login')
    }, [router])

    const hasRole = useCallback((role: UserRole): boolean => {
        return user?.roles?.includes(role) || false
    }, [user])

    const clearError = useCallback(() => {
        setError(null)
    }, [])

    return (
        <AuthContext.Provider
            value={{
                user,
                accessToken,
                isAuthenticated: !!user && !!accessToken,
                isLoading,
                error,
                login,
                register,
                loginWithCode,
                logout,
                hasRole,
                clearError,
            }}
        >
            {children}
        </AuthContext.Provider>
    )
}

export function useAuth() {
    const context = useContext(AuthContext)
    if (!context) {
        throw new Error('useAuth must be used within AuthProvider')
    }
    return context
}
