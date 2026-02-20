'use client'

import { useAuth } from '@/context/AuthContext'
import { useOrg } from '@/context/OrgContext'
import RouteGuard from '@/components/RouteGuard'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { apiClient } from '@/lib/api'
import {
    BarChart3, MessageSquare, Users, Clock, TrendingUp,
    Activity, Shield, LogOut, Zap, Bot, FileText, Eye,
    Building2, ChevronDown
} from 'lucide-react'

function DashboardPage() {
    const { user, logout } = useAuth()
    const { currentOrg, switchOrg, organizations, currentOrgRole, availableOrgRoles, switchOrgRole, isTenantAdmin } = useOrg()
    const router = useRouter()
    const [stats, setStats] = useState<any>(null)
    const [lastRefresh, setLastRefresh] = useState(new Date())

    const displayOrgs = organizations.map(o => ({ OrgId: o.OrgId, OrgName: o.OrgName || o.OrgId }))

    useEffect(() => {
        loadStats()
        // Auto-refresh every 30 seconds
        const interval = setInterval(() => {
            loadStats()
            setLastRefresh(new Date())
        }, 30000)
        return () => clearInterval(interval)
    }, [])

    const loadStats = async () => {
        try {
            const data = await apiClient.getDashboardStats()
            setStats(data)
        } catch (err) {
            console.error('Failed to load dashboard stats', err)
        }
    }

    return (
        <div className="min-h-screen bg-gradient-to-b from-slate-950 to-slate-900">
            {/* Top bar */}
            <header className="bg-slate-900/80 backdrop-blur-xl border-b border-white/5 sticky top-0 z-50">
                <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-gradient-to-br from-emerald-400 to-teal-500 rounded-lg flex items-center justify-center">
                            <BarChart3 className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h1 className="text-lg font-bold text-white">Observer Dashboard</h1>
                            <p className="text-xs text-purple-200/40">Bot performance & user traffic</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        {/* Org Switcher */}
                        {displayOrgs.length > 0 && (
                            <div className="relative">
                                <select
                                    value={currentOrg?.OrgId || ''}
                                    onChange={(e) => {
                                        const selectedOrgId = e.target.value
                                        switchOrg(selectedOrgId)
                                        // Navigate based on role in the selected org
                                        if (!isTenantAdmin && selectedOrgId) {
                                            const selectedOrgData = organizations.find(o => o.OrgId === selectedOrgId)
                                            const role = selectedOrgData?.EffectiveRole
                                            if (role === 'administrator') {
                                                router.push('/admin')
                                            } else if (role === 'user') {
                                                router.push('/chat')
                                            }
                                            // 'observer' stays on /dashboard
                                        }
                                    }}
                                    className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white appearance-none cursor-pointer focus:ring-1 focus:ring-emerald-500/50 outline-none pr-7"
                                >
                                    {displayOrgs.map(org => (
                                        <option key={org.OrgId} value={org.OrgId} className="bg-slate-900">
                                            {org.OrgName}
                                        </option>
                                    ))}
                                </select>
                                <Building2 className="absolute right-2 top-1.5 w-3.5 h-3.5 text-emerald-300/40 pointer-events-none" />
                            </div>
                        )}

                        {/* Role Switcher */}
                        {currentOrg && availableOrgRoles.length > 1 && !isTenantAdmin && (
                            <div className="relative">
                                <select
                                    value={currentOrgRole || ''}
                                    onChange={(e) => {
                                        const role = e.target.value as any
                                        switchOrgRole(role)
                                        if (role === 'administrator') {
                                            router.push('/admin')
                                        } else if (role === 'user') {
                                            router.push('/chat')
                                        }
                                        // 'observer' stays on /dashboard
                                    }}
                                    className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white appearance-none cursor-pointer focus:ring-1 focus:ring-emerald-500/50 outline-none pr-7"
                                >
                                    {availableOrgRoles.map(role => (
                                        <option key={role} value={role} className="bg-slate-900">
                                            {role.charAt(0).toUpperCase() + role.slice(1)}
                                        </option>
                                    ))}
                                </select>
                                <ChevronDown className="absolute right-2 top-1.5 w-3.5 h-3.5 text-emerald-300/40 pointer-events-none" />
                            </div>
                        )}

                        <div className="flex items-center gap-2 px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg">
                            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                            <span className="text-xs text-green-300 font-medium">Live</span>
                        </div>

                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-gradient-to-br from-emerald-400 to-teal-500 rounded-full flex items-center justify-center text-white text-xs font-bold">
                                {user?.firstName?.[0] || user?.email?.[0]?.toUpperCase() || 'O'}
                            </div>
                            <div className="hidden sm:block">
                                <p className="text-sm text-white font-medium">{user?.fullName || user?.email}</p>
                                <p className="text-xs text-purple-200/40 flex items-center gap-1">
                                    <Eye className="w-3 h-3" />
                                    Observer
                                </p>
                            </div>
                        </div>

                        <button
                            onClick={logout}
                            className="p-2 text-purple-200/50 hover:text-red-300 transition-colors rounded-lg hover:bg-white/5"
                            title="Sign out"
                        >
                            <LogOut className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </header>

            {/* Dashboard content */}
            <div className="max-w-7xl mx-auto px-6 py-8">

                {/* Metric cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                    {[
                        {
                            label: 'Total Sessions',
                            value: stats?.totalSessions || 0,
                            icon: Users,
                            color: 'from-purple-400 to-purple-600',
                            bgColor: 'bg-purple-500/10',
                            borderColor: 'border-purple-500/20',
                        },
                        {
                            label: 'Total Messages',
                            value: stats?.totalMessages || 0,
                            icon: MessageSquare,
                            color: 'from-blue-400 to-blue-600',
                            bgColor: 'bg-blue-500/10',
                            borderColor: 'border-blue-500/20',
                        },
                        {
                            label: 'Documents Indexed',
                            value: stats?.totalDocuments || 0,
                            icon: FileText,
                            color: 'from-emerald-400 to-emerald-600',
                            bgColor: 'bg-emerald-500/10',
                            borderColor: 'border-emerald-500/20',
                        },
                        {
                            label: 'Avg Confidence',
                            value: stats?.avgConfidence ? `${(stats.avgConfidence * 100).toFixed(0)}%` : '—',
                            icon: TrendingUp,
                            color: 'from-amber-400 to-amber-600',
                            bgColor: 'bg-amber-500/10',
                            borderColor: 'border-amber-500/20',
                        },
                    ].map(({ label, value, icon: Icon, color, bgColor, borderColor }) => (
                        <div
                            key={label}
                            className={`${bgColor} border ${borderColor} rounded-xl p-5 hover:scale-[1.02] transition-transform duration-200`}
                        >
                            <div className="flex items-center justify-between mb-3">
                                <span className="text-xs text-purple-200/50 uppercase tracking-wider font-medium">{label}</span>
                                <div className={`w-8 h-8 bg-gradient-to-br ${color} rounded-lg flex items-center justify-center`}>
                                    <Icon className="w-4 h-4 text-white" />
                                </div>
                            </div>
                            <p className="text-3xl font-bold text-white">{value}</p>
                        </div>
                    ))}
                </div>

                {/* System Health + Active Users */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                    {/* System Health */}
                    <div className="bg-white/5 border border-white/10 rounded-xl p-6">
                        <h3 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
                            <Activity className="w-4 h-4 text-emerald-400" />
                            System Health
                        </h3>
                        <div className="space-y-3">
                            {[
                                { name: 'API Server', status: 'healthy', icon: Zap },
                                { name: 'LLM (HuggingFace)', status: 'connected', icon: Bot },
                                { name: 'Vector DB', status: 'ready', icon: FileText },
                                { name: 'Authentication', status: 'active', icon: Shield },
                            ].map(({ name, status, icon: Icon }) => (
                                <div key={name} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                                    <div className="flex items-center gap-3">
                                        <Icon className="w-4 h-4 text-purple-300/50" />
                                        <span className="text-sm text-purple-200/70">{name}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className="w-2 h-2 bg-green-400 rounded-full" />
                                        <span className="text-xs text-green-300 font-medium capitalize">{status}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Active users */}
                    <div className="bg-white/5 border border-white/10 rounded-xl p-6">
                        <h3 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
                            <Users className="w-4 h-4 text-blue-400" />
                            Active Users
                        </h3>
                        <div className="flex items-center justify-center py-8">
                            <div className="text-center">
                                <p className="text-5xl font-bold text-white mb-2">{stats?.activeUsers || 0}</p>
                                <p className="text-purple-200/50 text-sm">currently online</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Recent queries */}
                <div className="bg-white/5 border border-white/10 rounded-xl p-6">
                    <h3 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
                        <Clock className="w-4 h-4 text-purple-400" />
                        Recent Queries
                    </h3>

                    {stats?.recentQueries?.length > 0 ? (
                        <div className="space-y-2">
                            {stats.recentQueries.map((query: any, i: number) => (
                                <div key={i} className="flex items-center gap-3 py-2 border-b border-white/5 last:border-0">
                                    <MessageSquare className="w-4 h-4 text-purple-300/40 flex-shrink-0" />
                                    <p className="text-sm text-purple-200/70 truncate flex-1">{query.text}</p>
                                    <span className="text-xs text-purple-200/30">
                                        {query.confidence ? `${(query.confidence * 100).toFixed(0)}%` : '—'}
                                    </span>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-8">
                            <MessageSquare className="w-8 h-8 text-purple-300/20 mx-auto mb-3" />
                            <p className="text-purple-200/40 text-sm">No queries recorded yet</p>
                            <p className="text-purple-200/20 text-xs mt-1">Queries will appear here as users interact with the bot</p>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="mt-8 text-center">
                    <p className="text-purple-200/20 text-xs">
                        Last updated: {lastRefresh.toLocaleTimeString()} · Auto-refreshes every 30s
                    </p>
                </div>
            </div>
        </div>
    )
}

export default function Dashboard() {
    return (
        <RouteGuard allowedRoles={['administrator', 'observer']}>
            <DashboardPage />
        </RouteGuard>
    )
}
