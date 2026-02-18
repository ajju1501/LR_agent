'use client'

import { useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { Eye, EyeOff, Mail, Lock, User, AtSign, ArrowRight, Shield, MessageSquare, BarChart3 } from 'lucide-react'

function LoginForm() {
    const { login, register, isLoading, error, clearError, initiateOAuthLogin } = useAuth()
    const [isLogin, setIsLogin] = useState(true)
    const [showPassword, setShowPassword] = useState(false)
    const [formData, setFormData] = useState({
        email: '',
        password: '',
        firstName: '',
        lastName: '',
        username: '',
    })

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        clearError()

        if (isLogin) {
            await login(formData.email, formData.password)
        } else {
            await register(formData.email, formData.password, formData.firstName, formData.lastName, formData.username)
        }
    }

    const toggleMode = () => {
        setIsLogin(!isLogin)
        clearError()
    }

    return (
        <div className="min-h-screen flex bg-gradient-to-br from-slate-900 via-purple-950 to-slate-900 relative overflow-hidden">

            {/* Animated background elements */}
            <div className="absolute inset-0 pointer-events-none">
                <div className="absolute top-20 left-10 w-72 h-72 bg-purple-500/10 rounded-full blur-3xl animate-pulse" />
                <div className="absolute bottom-20 right-10 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-indigo-500/5 rounded-full blur-3xl" />
            </div>

            {/* Left side — Branding / Feature highlights */}
            <div className="hidden lg:flex lg:w-1/2 flex-col justify-center px-16 relative z-10">
                <div className="max-w-lg">
                    <div className="flex items-center gap-3 mb-8">
                        <div className="w-12 h-12 bg-gradient-to-br from-purple-400 to-blue-500 rounded-xl flex items-center justify-center shadow-lg shadow-purple-500/25">
                            <Shield className="w-7 h-7 text-white" />
                        </div>
                        <h1 className="text-3xl font-bold text-white tracking-tight">
                            LoginRadius <span className="text-purple-300">Chatbot</span>
                        </h1>
                    </div>

                    <p className="text-lg text-purple-200/80 mb-12 leading-relaxed">
                        AI-powered documentation assistant with role-based access control. Get instant answers from LoginRadius docs.
                    </p>

                    <div className="space-y-6">
                        {[
                            { icon: MessageSquare, title: 'Chatbot Access', desc: 'Ask questions and get AI-powered answers from LoginRadius documentation', role: 'User' },
                            { icon: Shield, title: 'Admin Control', desc: 'Manage documents, scrape docs, and control user access', role: 'Administrator' },
                            { icon: BarChart3, title: 'Analytics Dashboard', desc: 'Monitor bot performance, user traffic, and system health', role: 'Observer' },
                        ].map(({ icon: Icon, title, desc, role }) => (
                            <div key={title} className="flex gap-4 group">
                                <div className="w-10 h-10 bg-white/5 border border-white/10 rounded-lg flex items-center justify-center flex-shrink-0 group-hover:bg-white/10 transition-colors">
                                    <Icon className="w-5 h-5 text-purple-300" />
                                </div>
                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <h3 className="text-white font-semibold text-sm">{title}</h3>
                                        <span className="px-2 py-0.5 bg-purple-500/20 border border-purple-400/30 rounded-full text-xs text-purple-300">{role}</span>
                                    </div>
                                    <p className="text-purple-200/60 text-sm leading-relaxed">{desc}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Right side — Login/Register form */}
            <div className="w-full lg:w-1/2 flex items-center justify-center relative z-10 p-6">
                <div className="w-full max-w-md">

                    {/* Glass card */}
                    <div className="bg-white/5 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-2xl shadow-black/20 p-8">

                        {/* Mobile logo */}
                        <div className="lg:hidden flex items-center gap-3 mb-8 justify-center">
                            <div className="w-10 h-10 bg-gradient-to-br from-purple-400 to-blue-500 rounded-xl flex items-center justify-center">
                                <Shield className="w-6 h-6 text-white" />
                            </div>
                            <h1 className="text-xl font-bold text-white">LR Chatbot</h1>
                        </div>

                        <div className="mb-8">
                            <h2 className="text-2xl font-bold text-white mb-2">
                                {isLogin ? 'Welcome back' : 'Create account'}
                            </h2>
                            <p className="text-purple-200/60 text-sm">
                                {isLogin ? 'Sign in to access your dashboard' : 'Register to get started with the chatbot'}
                            </p>
                        </div>

                        {/* Error message */}
                        {error && (
                            <div className="mb-6 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                                <p className="text-red-300 text-sm">{error}</p>
                            </div>
                        )}

                        <form onSubmit={handleSubmit} className="space-y-5">

                            {/* Name fields (register only) */}
                            {!isLogin && (
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs font-medium text-purple-200/70 mb-1.5 uppercase tracking-wider">First Name</label>
                                        <div className="relative">
                                            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-purple-300/50" />
                                            <input
                                                type="text"
                                                value={formData.firstName}
                                                onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                                                placeholder="John"
                                                className="w-full pl-10 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white text-sm placeholder-purple-300/30 focus:outline-none focus:ring-2 focus:ring-purple-400/50 focus:border-transparent transition-all"
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-purple-200/70 mb-1.5 uppercase tracking-wider">Last Name</label>
                                        <div className="relative">
                                            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-purple-300/50" />
                                            <input
                                                type="text"
                                                value={formData.lastName}
                                                onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                                                placeholder="Doe"
                                                className="w-full pl-10 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white text-sm placeholder-purple-300/30 focus:outline-none focus:ring-2 focus:ring-purple-400/50 focus:border-transparent transition-all"
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Username (register only) */}
                            {!isLogin && (
                                <div>
                                    <label className="block text-xs font-medium text-purple-200/70 mb-1.5 uppercase tracking-wider">Username</label>
                                    <div className="relative">
                                        <AtSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-purple-300/50" />
                                        <input
                                            type="text"
                                            value={formData.username}
                                            onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                                            placeholder="johndoe"
                                            required
                                            className="w-full pl-10 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white text-sm placeholder-purple-300/30 focus:outline-none focus:ring-2 focus:ring-purple-400/50 focus:border-transparent transition-all"
                                        />
                                    </div>
                                </div>
                            )}

                            {/* Email */}
                            <div>
                                <label className="block text-xs font-medium text-purple-200/70 mb-1.5 uppercase tracking-wider">Email Address</label>
                                <div className="relative">
                                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-purple-300/50" />
                                    <input
                                        type="email"
                                        value={formData.email}
                                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                        placeholder="you@example.com"
                                        required
                                        className="w-full pl-10 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white text-sm placeholder-purple-300/30 focus:outline-none focus:ring-2 focus:ring-purple-400/50 focus:border-transparent transition-all"
                                    />
                                </div>
                            </div>

                            {/* Password */}
                            <div>
                                <label className="block text-xs font-medium text-purple-200/70 mb-1.5 uppercase tracking-wider">Password</label>
                                <div className="relative">
                                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-purple-300/50" />
                                    <input
                                        type={showPassword ? 'text' : 'password'}
                                        value={formData.password}
                                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                        placeholder="••••••••"
                                        required
                                        className="w-full pl-10 pr-12 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white text-sm placeholder-purple-300/30 focus:outline-none focus:ring-2 focus:ring-purple-400/50 focus:border-transparent transition-all"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-purple-300/50 hover:text-purple-200 transition-colors"
                                    >
                                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                </div>
                            </div>

                            {/* Submit */}
                            <button
                                type="submit"
                                disabled={isLoading}
                                className="w-full flex items-center justify-center gap-2 py-2.5 bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 disabled:from-gray-600 disabled:to-gray-600 text-white font-semibold rounded-lg transition-all duration-200 shadow-lg shadow-purple-500/25 hover:shadow-purple-500/40 disabled:shadow-none"
                            >
                                {isLoading ? (
                                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                ) : (
                                    <>
                                        {isLogin ? 'Sign In' : 'Create Account'}
                                        <ArrowRight className="w-4 h-4" />
                                    </>
                                )}
                            </button>
                        </form>

                        {/* Toggle login/register */}
                        <div className="mt-6 text-center">
                            <p className="text-purple-200/50 text-sm">
                                {isLogin ? "Don't have an account?" : 'Already have an account?'}
                                <button
                                    onClick={toggleMode}
                                    className="ml-1 text-purple-300 hover:text-purple-200 font-medium transition-colors"
                                >
                                    {isLogin ? 'Register' : 'Sign In'}
                                </button>
                            </p>
                        </div>

                        {/* OAuth / OIDC Divider */}
                        <div className="relative my-8">
                            <div className="absolute inset-0 flex items-center">
                                <span className="w-full border-t border-white/10"></span>
                            </div>
                            <div className="relative flex justify-center text-xs uppercase">
                                <span className="bg-[#0f172a] px-2 text-purple-200/50">Or continue with</span>
                            </div>
                        </div>

                        {/* OAuth Button */}
                        <button
                            type="button"
                            onClick={() => initiateOAuthLogin()}
                            disabled={isLoading}
                            className="w-full flex items-center justify-center gap-3 py-2.5 bg-white/5 border border-white/10 hover:bg-white/10 text-white font-medium rounded-lg transition-all duration-200"
                        >
                            <Shield className="w-5 h-5 text-purple-400" />
                            Sign in with LoginRadius (OAuth 2.0)
                        </button>
                    </div>

                    {/* Footer */}
                    <p className="text-center text-purple-200/30 text-xs mt-6">
                        Secured by LoginRadius Authentication
                    </p>
                </div>
            </div>
        </div>
    )
}

export default function LoginPage() {
    return (
        <LoginForm />
    )
}
