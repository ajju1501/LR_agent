'use client'

import { useAuth } from '@/context/AuthContext'
import { ChatProvider } from '@/context/ChatContext'
import RouteGuard from '@/components/RouteGuard'
import ChatInterface from '@/components/ChatInterface'
import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { apiClient } from '@/lib/api'
import { usePagePermissions } from '@/hooks/usePagePermissions'
import {
    Shield, MessageSquare, FolderOpen, Users, Settings,
    LogOut, Globe, Loader2, CheckCircle, AlertCircle,
    Database, FileText, UserPlus, Upload, Github, Trash2,
    Building2, Plus, ChevronDown, Eye, Lock, Crown
} from 'lucide-react'
import { useOrg } from '@/context/OrgContext'

type TabId = 'organizations' | 'chat' | 'documents' | 'users'

function AdminPage() {
    const { user, logout } = useAuth()
    const { currentOrg, switchOrg, allOrganizations, organizations, loadAllOrgs, loadMyOrgs, currentOrgRole, isTenantAdmin, availableOrgRoles, switchOrgRole } = useOrg()
    const perms = usePagePermissions()
    const router = useRouter()

    // Determine available tabs based on permissions
    const availableTabs = useMemo(() => {
        const tabs: { id: TabId; label: string; icon: any }[] = []

        if (perms.canManageOrgs) {
            tabs.push({ id: 'organizations', label: 'Organizations', icon: Building2 })
        }
        if (perms.canChat) {
            tabs.push({ id: 'chat', label: 'Chatbot', icon: MessageSquare })
        }
        if (perms.canManageDocuments || perms.canViewDocuments) {
            tabs.push({ id: 'documents', label: 'Documents', icon: FolderOpen })
        }
        if (perms.canManageUsers) {
            tabs.push({ id: 'users', label: 'User Management', icon: Users })
        }

        return tabs
    }, [perms])

    const [activeTab, setActiveTab] = useState<TabId>('organizations')

    // Set default tab based on permissions
    useEffect(() => {
        if (availableTabs.length > 0 && !availableTabs.some(t => t.id === activeTab)) {
            setActiveTab(availableTabs[0].id)
        }
    }, [availableTabs, activeTab])

    useEffect(() => {
        if (isTenantAdmin) {
            loadAllOrgs()
        } else {
            loadMyOrgs()
        }
    }, [isTenantAdmin, loadAllOrgs, loadMyOrgs])

    // Determine which orgs to show in dropdown
    const displayOrgs = isTenantAdmin
        ? allOrganizations.map(o => ({ OrgId: o.Id, OrgName: o.Name }))
        : organizations.map(o => ({ OrgId: o.OrgId, OrgName: o.OrgName || o.OrgId }))

    // Role badge color
    const getRoleBadge = () => {
        if (isTenantAdmin) return { text: 'Tenant Admin', color: 'bg-amber-500/20 text-amber-300 border-amber-500/30' }
        switch (currentOrgRole) {
            case 'administrator': return { text: 'Org Admin', color: 'bg-purple-500/20 text-purple-300 border-purple-500/30' }
            case 'user': return { text: 'User', color: 'bg-blue-500/20 text-blue-300 border-blue-500/30' }
            case 'observer': return { text: 'Observer', color: 'bg-gray-500/20 text-gray-300 border-gray-500/30' }
            default: return { text: 'No Access', color: 'bg-red-500/20 text-red-300 border-red-500/30' }
        }
    }

    const roleBadge = getRoleBadge()

    return (
        <div className="h-screen flex bg-slate-950">
            {/* Admin Sidebar */}
            <aside className="w-64 bg-gradient-to-b from-slate-900 to-slate-950 border-r border-white/5 flex flex-col">
                {/* Logo */}
                <div className="p-5 border-b border-white/5">
                    <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${isTenantAdmin
                            ? 'bg-gradient-to-br from-amber-400 to-orange-500'
                            : 'bg-gradient-to-br from-purple-400 to-blue-500'
                            }`}>
                            {isTenantAdmin ? <Crown className="w-5 h-5 text-white" /> : <Shield className="w-5 h-5 text-white" />}
                        </div>
                        <div>
                            <h1 className="text-sm font-bold text-white">
                                {isTenantAdmin ? 'Tenant Panel' : 'Management'}
                            </h1>
                            <p className="text-xs text-purple-300/60">
                                {isTenantAdmin ? 'Super Administrator' : currentOrg?.OrgName || 'Select Org'}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Organization Selection */}
                <div className="px-5 py-4 border-b border-white/5">
                    <label className="block text-[10px] text-purple-300/40 uppercase tracking-widest font-bold mb-2">Active Context</label>
                    <div className="relative">
                        <select
                            value={currentOrg?.OrgId || ''}
                            onChange={(e) => {
                                const selectedOrgId = e.target.value
                                switchOrg(selectedOrgId)

                                // Navigate based on user's role in the selected org
                                if (!isTenantAdmin && selectedOrgId) {
                                    const selectedOrgData = organizations.find(o => o.OrgId === selectedOrgId)
                                    const role = selectedOrgData?.EffectiveRole
                                    if (role === 'observer') {
                                        router.push('/dashboard')
                                    } else if (role === 'user') {
                                        router.push('/chat')
                                    }
                                    // 'administrator' stays on /admin
                                }
                            }}
                            className="w-full bg-slate-900/50 border border-white/10 rounded-lg px-3 py-2 text-xs text-white appearance-none cursor-pointer focus:ring-1 focus:ring-purple-500/50 outline-none"
                        >
                            {isTenantAdmin && (
                                <option value="" className="bg-slate-900">Global (No Org)</option>
                            )}
                            {displayOrgs.map(org => (
                                <option key={org.OrgId} value={org.OrgId} className="bg-slate-900">
                                    {org.OrgName}
                                </option>
                            ))}
                        </select>
                        <ChevronDown className="absolute right-2 top-2.5 w-3.5 h-3.5 text-purple-300/40 pointer-events-none" />
                    </div>

                    {/* Role Switcher — shows when org has multiple roles */}
                    {currentOrg && availableOrgRoles.length > 1 && !isTenantAdmin && (
                        <div className="mt-2">
                            <label className="block text-[10px] text-purple-300/40 uppercase tracking-widest font-bold mb-1">Active Role</label>
                            <div className="relative">
                                <select
                                    value={currentOrgRole || ''}
                                    onChange={(e) => {
                                        const role = e.target.value as any
                                        switchOrgRole(role)
                                        // Navigate to the correct page for the selected role
                                        if (role === 'observer') {
                                            router.push('/dashboard')
                                        } else if (role === 'user') {
                                            router.push('/chat')
                                        }
                                        // 'administrator' stays on /admin
                                    }}
                                    className="w-full bg-slate-900/50 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white appearance-none cursor-pointer focus:ring-1 focus:ring-purple-500/50 outline-none"
                                >
                                    {availableOrgRoles.map(role => (
                                        <option key={role} value={role} className="bg-slate-900">
                                            {role.charAt(0).toUpperCase() + role.slice(1)}
                                        </option>
                                    ))}
                                </select>
                                <ChevronDown className="absolute right-2 top-1.5 w-3.5 h-3.5 text-purple-300/40 pointer-events-none" />
                            </div>
                        </div>
                    )}

                    {/* Role Badge */}
                    {currentOrg && (
                        <div className="mt-2 flex items-center gap-2">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${roleBadge.color}`}>
                                {currentOrgRole === 'administrator' || isTenantAdmin ? (
                                    <Shield className="w-2.5 h-2.5" />
                                ) : currentOrgRole === 'observer' ? (
                                    <Eye className="w-2.5 h-2.5" />
                                ) : currentOrgRole === 'user' ? (
                                    <Users className="w-2.5 h-2.5" />
                                ) : (
                                    <Lock className="w-2.5 h-2.5" />
                                )}
                                {roleBadge.text}
                            </span>
                        </div>
                    )}
                </div>

                {/* Nav */}
                <nav className="flex-1 p-3 space-y-1">
                    {availableTabs.map(({ id, label, icon: Icon }) => (
                        <button
                            key={id}
                            onClick={() => setActiveTab(id)}
                            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${activeTab === id
                                ? 'bg-purple-500/20 text-purple-200 border border-purple-500/30'
                                : 'text-purple-200/50 hover:text-purple-200 hover:bg-white/5'
                                }`}
                        >
                            <Icon className="w-4 h-4" />
                            {label}
                        </button>
                    ))}

                    {/* Show message if no tabs available */}
                    {availableTabs.length === 0 && (
                        <div className="p-4 text-center">
                            <Lock className="w-8 h-8 text-purple-300/20 mx-auto mb-2" />
                            <p className="text-purple-200/40 text-xs">No permissions for this org</p>
                            <p className="text-purple-200/20 text-[10px] mt-1">Select a different organization</p>
                        </div>
                    )}
                </nav>

                {/* User info + logout */}
                <div className="p-4 border-t border-white/5">
                    <div className="flex items-center gap-3 mb-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold ${isTenantAdmin
                            ? 'bg-gradient-to-br from-amber-400 to-orange-500'
                            : 'bg-gradient-to-br from-green-400 to-emerald-500'
                            }`}>
                            {user?.firstName?.[0] || user?.email?.[0]?.toUpperCase() || 'A'}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm text-white font-medium truncate">{user?.fullName || user?.email}</p>
                            <div className="flex flex-wrap gap-1 mt-0.5">
                                {user?.roles?.map(role => (
                                    <span key={role} className="text-[9px] text-purple-300/50 bg-purple-500/10 px-1.5 py-0.5 rounded capitalize">
                                        {role}
                                    </span>
                                ))}
                            </div>
                        </div>
                    </div>
                    <button
                        onClick={logout}
                        className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-red-500/10 border border-red-500/20 text-red-300 rounded-lg text-xs font-medium hover:bg-red-500/20 transition-colors"
                    >
                        <LogOut className="w-3.5 h-3.5" />
                        Sign Out
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 flex flex-col overflow-hidden">
                {activeTab === 'chat' && perms.canChat && (
                    <ChatProvider>
                        <ChatInterface />
                    </ChatProvider>
                )}

                {activeTab === 'documents' && <DocumentsPanel readOnly={!perms.canManageDocuments} />}
                {activeTab === 'users' && perms.canManageUsers && <UsersPanel />}
                {activeTab === 'organizations' && perms.canManageOrgs && <OrganizationsPanel />}

                {/* No permissions fallback */}
                {availableTabs.length === 0 && (
                    <div className="flex-1 flex items-center justify-center bg-gradient-to-b from-slate-950 to-slate-900">
                        <div className="text-center max-w-md">
                            <div className="w-16 h-16 bg-purple-500/10 border border-purple-500/20 rounded-2xl flex items-center justify-center mx-auto mb-6">
                                <Lock className="w-8 h-8 text-purple-400/50" />
                            </div>
                            <h2 className="text-xl font-bold text-white mb-2">No Access</h2>
                            <p className="text-purple-200/50 text-sm">
                                {currentOrg
                                    ? `You don't have any roles in "${currentOrg.OrgName}". Please select a different organization.`
                                    : 'Please select an organization to continue.'
                                }
                            </p>
                        </div>
                    </div>
                )}
            </main>
        </div>
    )
}

/* ─────────── Documents Panel ─────────── */
function DocumentsPanel({ readOnly = false }: { readOnly?: boolean }) {
    const { currentOrg } = useOrg()
    const [stats, setStats] = useState<any>(null)
    const [resources, setResources] = useState<any[]>([])
    const [scraping, setScraping] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState<string | null>(null)

    // PDF upload state
    const [uploading, setUploading] = useState(false)
    const [dragActive, setDragActive] = useState(false)

    // GitHub state
    const [repoUrl, setRepoUrl] = useState('')
    const [ingesting, setIngesting] = useState(false)

    useEffect(() => {
        loadStats()
        loadResources()
    }, [currentOrg?.OrgId])

    const loadStats = async () => {
        try {
            const data = await apiClient.getDocumentStats()
            setStats(data)
        } catch (err: any) {
            console.error('Failed to load stats', err)
        }
    }

    const loadResources = async () => {
        try {
            const data = await apiClient.listResources()
            setResources(data)
        } catch (err: any) {
            console.error('Failed to load resources', err)
        }
    }

    const handleScrape = async () => {
        try {
            setScraping(true)
            setError(null)
            setSuccess(null)

            const result = await apiClient.scrapeLoginRadiusDocs(50)
            setSuccess(`Scraped ${result.totalScraped} pages, indexed ${result.totalIndexed} documents`)
            await loadStats()
        } catch (err: any) {
            setError(err.message || 'Scraping failed')
        } finally {
            setScraping(false)
        }
    }

    // PDF Upload handlers
    const handleFileSelect = async (file: File) => {
        if (file.type !== 'application/pdf') {
            setError('Only PDF files are allowed')
            return
        }
        if (file.size > 20 * 1024 * 1024) {
            setError('File size must be under 20MB')
            return
        }

        try {
            setUploading(true)
            setError(null)
            setSuccess(null)

            const result = await apiClient.uploadPDF(file)
            setSuccess(`PDF "${file.name}" uploaded and indexed (${result.chunks_count} chunks)`)
            await loadStats()
            await loadResources()
        } catch (err: any) {
            setError(err.message || 'Failed to upload PDF')
        } finally {
            setUploading(false)
        }
    }

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault()
        setDragActive(false)
        const file = e.dataTransfer.files?.[0]
        if (file) handleFileSelect(file)
    }

    const handleDrag = (e: React.DragEvent) => {
        e.preventDefault()
        setDragActive(e.type === 'dragenter' || e.type === 'dragover')
    }

    // GitHub ingestion
    const handleIngestGitHub = async () => {
        if (!repoUrl.trim()) return

        try {
            setIngesting(true)
            setError(null)
            setSuccess(null)

            const result = await apiClient.ingestGitHubRepo(repoUrl.trim())
            setSuccess(`GitHub repo indexed (${result.chunks_count} chunks)`)
            setRepoUrl('')
            await loadStats()
            await loadResources()
        } catch (err: any) {
            setError(err.message || 'Failed to ingest GitHub repo')
        } finally {
            setIngesting(false)
        }
    }

    // Delete resource
    const handleDeleteResource = async (id: string) => {
        try {
            await apiClient.deleteResourceItem(id)
            await loadResources()
        } catch (err: any) {
            setError(err.message || 'Failed to delete resource')
        }
    }

    return (
        <div className="flex-1 p-8 overflow-y-auto bg-gradient-to-b from-slate-950 to-slate-900">
            <div className="max-w-4xl mx-auto">
                <div className="mb-8 border-b border-white/5 pb-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-2xl font-bold text-white mb-2">Knowledge Base</h2>
                            <p className="text-purple-200/50 text-sm">
                                {readOnly ? 'Viewing' : 'Manage'} documents for <span className="text-purple-300 font-bold">{currentOrg?.OrgName || 'Global Context'}</span>
                            </p>
                        </div>
                        {readOnly && (
                            <span className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/10 border border-amber-500/20 rounded-lg text-amber-300 text-xs font-medium">
                                <Eye className="w-3.5 h-3.5" />
                                Read Only
                            </span>
                        )}
                    </div>
                </div>

                {/* Global status messages */}
                {success && (
                    <div className="mb-6 p-4 bg-green-500/10 border border-green-500/20 rounded-lg flex items-center gap-2 animate-fade-in">
                        <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0" />
                        <p className="text-green-300 text-sm">{success}</p>
                        <button onClick={() => setSuccess(null)} className="ml-auto text-green-300/50 hover:text-green-300 text-xs">✕</button>
                    </div>
                )}
                {error && (
                    <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                        <p className="text-red-300 text-sm">{error}</p>
                        <button onClick={() => setError(null)} className="ml-auto text-red-300/50 hover:text-red-300 text-xs">✕</button>
                    </div>
                )}

                {/* Stats cards */}
                <div className="grid grid-cols-3 gap-4 mb-8">
                    {[
                        { label: 'Documents', value: stats?.documentCount || 0, icon: FileText },
                        { label: 'Total Chunks', value: stats?.chunkCount || 0, icon: Database },
                        { label: 'Resources', value: resources.length, icon: FolderOpen },
                    ].map(({ label, value, icon: Icon }) => (
                        <div key={label} className="bg-white/5 border border-white/10 rounded-xl p-5 hover:border-purple-500/20 transition-colors">
                            <div className="flex items-center gap-3 mb-2">
                                <Icon className="w-4 h-4 text-purple-300/60" />
                                <span className="text-xs text-purple-200/50 uppercase tracking-wider font-medium">{label}</span>
                            </div>
                            <p className="text-2xl font-bold text-white">{value}</p>
                        </div>
                    ))}
                </div>

                {/* ──── PDF Upload (admin only) ──── */}
                {!readOnly && (
                    <div className="bg-white/5 border border-white/10 rounded-xl p-6 mb-6">
                        <h3 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
                            <Upload className="w-5 h-5 text-purple-400" />
                            Upload PDF
                        </h3>
                        <p className="text-purple-200/50 text-sm mb-4">
                            Upload PDF documents to add to the chatbot&apos;s knowledge base. Max 20MB per file.
                        </p>

                        <div
                            onDragEnter={handleDrag}
                            onDragLeave={handleDrag}
                            onDragOver={handleDrag}
                            onDrop={handleDrop}
                            className={`relative border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer
                                ${dragActive
                                    ? 'border-purple-400 bg-purple-500/10'
                                    : 'border-white/10 hover:border-purple-400/40 hover:bg-white/[0.02]'
                                }
                                ${uploading ? 'opacity-50 pointer-events-none' : ''}
                            `}
                        >
                            <input
                                type="file"
                                accept=".pdf"
                                onChange={(e) => {
                                    const file = e.target.files?.[0]
                                    if (file) handleFileSelect(file)
                                    e.target.value = ''
                                }}
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                id="pdf-upload-input"
                            />

                            {uploading ? (
                                <div className="flex flex-col items-center gap-3">
                                    <Loader2 className="w-8 h-8 text-purple-400 animate-spin" />
                                    <p className="text-purple-200 text-sm font-medium">Processing PDF...</p>
                                    <p className="text-purple-200/40 text-xs">Extracting text, chunking & indexing</p>
                                </div>
                            ) : (
                                <div className="flex flex-col items-center gap-3">
                                    <div className="w-12 h-12 bg-purple-500/10 border border-purple-500/20 rounded-xl flex items-center justify-center">
                                        <Upload className="w-6 h-6 text-purple-400" />
                                    </div>
                                    <div>
                                        <p className="text-purple-200 text-sm font-medium">
                                            Drop a PDF here or <span className="text-purple-400 underline">browse</span>
                                        </p>
                                        <p className="text-purple-200/40 text-xs mt-1">PDF files up to 20MB</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* ──── GitHub Repo (admin only) ──── */}
                {!readOnly && (
                    <div className="bg-white/5 border border-white/10 rounded-xl p-6 mb-6">
                        <h3 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
                            <Github className="w-5 h-5 text-purple-400" />
                            Add GitHub Repository
                        </h3>
                        <p className="text-purple-200/50 text-sm mb-4">
                            Index a public GitHub repository&apos;s code and documentation into the knowledge base.
                        </p>

                        <div className="flex gap-3">
                            <input
                                type="text"
                                value={repoUrl}
                                onChange={(e) => setRepoUrl(e.target.value)}
                                placeholder="https://github.com/owner/repo"
                                disabled={ingesting}
                                className="flex-1 px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white text-sm placeholder-purple-300/30 focus:outline-none focus:ring-2 focus:ring-purple-400/50 transition-all disabled:opacity-50"
                                id="github-repo-input"
                                onKeyDown={(e) => { if (e.key === 'Enter') handleIngestGitHub() }}
                            />
                            <button
                                onClick={handleIngestGitHub}
                                disabled={ingesting || !repoUrl.trim()}
                                className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 disabled:from-gray-600 disabled:to-gray-600 text-white font-medium rounded-lg transition-all text-sm shadow-lg shadow-purple-500/20 whitespace-nowrap"
                                id="ingest-github-btn"
                            >
                                {ingesting ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        Indexing...
                                    </>
                                ) : (
                                    <>
                                        <Github className="w-4 h-4" />
                                        Add Repo
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                )}

                {/* ──── Scrape LoginRadius Docs (admin only) ──── */}
                {!readOnly && (
                    <div className="bg-white/5 border border-white/10 rounded-xl p-6 mb-6">
                        <h3 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
                            <Globe className="w-5 h-5 text-purple-400" />
                            Scrape LoginRadius Docs
                        </h3>
                        <p className="text-purple-200/50 text-sm mb-4">
                            Automatically crawl and index the LoginRadius documentation website.
                        </p>

                        <button
                            onClick={handleScrape}
                            disabled={scraping}
                            className="flex items-center gap-2 px-5 py-2.5 bg-white/10 border border-white/20 text-white font-medium rounded-lg text-sm hover:bg-white/15 disabled:opacity-50 transition-colors"
                            id="scrape-docs-btn"
                        >
                            {scraping ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Scraping...
                                </>
                            ) : (
                                <>
                                    <Globe className="w-4 h-4" />
                                    Start Scraping
                                </>
                            )}
                        </button>
                    </div>
                )}

                {/* ──── Resource List ──── */}
                <div className="bg-white/5 border border-white/10 rounded-xl p-6">
                    <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                        <Database className="w-5 h-5 text-purple-400" />
                        Indexed Resources
                    </h3>

                    {resources.length === 0 ? (
                        <div className="text-center py-8">
                            <FolderOpen className="w-10 h-10 text-purple-300/20 mx-auto mb-3" />
                            <p className="text-purple-200/40 text-sm">No resources uploaded yet</p>
                            {!readOnly && (
                                <p className="text-purple-200/20 text-xs mt-1">Upload a PDF or add a GitHub repo to get started</p>
                            )}
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {resources.map((r: any) => (
                                <div key={r.id} className="flex items-center gap-4 p-4 bg-white/[0.02] border border-white/5 rounded-lg hover:border-purple-500/20 transition-colors group">
                                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${r.type === 'pdf'
                                        ? 'bg-red-500/10 border border-red-500/20'
                                        : 'bg-blue-500/10 border border-blue-500/20'
                                        }`}>
                                        {r.type === 'pdf'
                                            ? <FileText className="w-5 h-5 text-red-400" />
                                            : <Github className="w-5 h-5 text-blue-400" />
                                        }
                                    </div>

                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm text-white font-medium truncate">{r.name}</p>
                                        <div className="flex items-center gap-3 mt-1">
                                            <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${r.status === 'indexed'
                                                ? 'bg-green-500/10 text-green-400'
                                                : r.status === 'processing'
                                                    ? 'bg-yellow-500/10 text-yellow-400'
                                                    : 'bg-red-500/10 text-red-400'
                                                }`}>
                                                {r.status === 'indexed' && <CheckCircle className="w-3 h-3" />}
                                                {r.status === 'processing' && <Loader2 className="w-3 h-3 animate-spin" />}
                                                {r.status === 'failed' && <AlertCircle className="w-3 h-3" />}
                                                {r.status}
                                            </span>
                                            <span className="text-xs text-purple-200/40">
                                                {r.chunks_count} chunks
                                            </span>
                                            <span className="text-xs text-purple-200/30">
                                                {new Date(r.created_at).toLocaleDateString()}
                                            </span>
                                        </div>
                                        {r.error && (
                                            <p className="text-xs text-red-400/70 mt-1 truncate">{r.error}</p>
                                        )}
                                    </div>

                                    {!readOnly && (
                                        <button
                                            onClick={() => handleDeleteResource(r.id)}
                                            className="p-2 text-purple-200/30 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all rounded-lg hover:bg-red-500/10"
                                            title="Delete resource"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

/* ─────────── Users Panel ─────────── */
function UsersPanel() {
    const [uid, setUid] = useState('')
    const [selectedRole, setSelectedRole] = useState('user')
    const [assigning, setAssigning] = useState(false)
    const [result, setResult] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [setupDone, setSetupDone] = useState(false)
    const perms = usePagePermissions()

    const handleAssignRole = async () => {
        if (!uid.trim()) return
        try {
            setAssigning(true)
            setError(null)
            setResult(null)
            await apiClient.assignRole(uid.trim(), [selectedRole])
            setResult(`Role "${selectedRole}" assigned to user ${uid}`)
            setUid('')
        } catch (err: any) {
            setError(err.message || 'Failed to assign role')
        } finally {
            setAssigning(false)
        }
    }

    const handleSetupRoles = async () => {
        try {
            await apiClient.setupRoles()
            setSetupDone(true)
        } catch (err: any) {
            setError(err.message || 'Failed to setup roles')
        }
    }

    return (
        <div className="flex-1 p-8 overflow-y-auto bg-gradient-to-b from-slate-950 to-slate-900">
            <div className="max-w-2xl mx-auto">
                <h2 className="text-2xl font-bold text-white mb-2">User Management</h2>
                <p className="text-purple-200/50 text-sm mb-8">Assign roles to users via LoginRadius</p>

                {/* Setup roles (one-time, tenant admin only) */}
                {perms.isTenantAdmin && (
                    <div className="bg-white/5 border border-white/10 rounded-xl p-6 mb-6">
                        <h3 className="text-base font-semibold text-white mb-2 flex items-center gap-2">
                            <Settings className="w-4 h-4 text-purple-300" />
                            Initial Role Setup
                        </h3>
                        <p className="text-purple-200/50 text-sm mb-4">
                            Create the three roles (administrator, user, observer) in your LoginRadius app. Only needs to be done once.
                        </p>
                        <button
                            onClick={handleSetupRoles}
                            disabled={setupDone}
                            className="flex items-center gap-2 px-4 py-2 bg-white/10 border border-white/20 text-white rounded-lg text-sm font-medium hover:bg-white/15 disabled:opacity-50 transition-colors"
                        >
                            {setupDone ? (
                                <>
                                    <CheckCircle className="w-4 h-4 text-green-400" />
                                    Roles Created
                                </>
                            ) : (
                                <>
                                    <Settings className="w-4 h-4" />
                                    Setup Roles
                                </>
                            )}
                        </button>
                    </div>
                )}

                {/* Assign role */}
                <div className="bg-white/5 border border-white/10 rounded-xl p-6">
                    <h3 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
                        <UserPlus className="w-4 h-4 text-purple-300" />
                        Assign Role to User
                    </h3>

                    <div className="space-y-4">
                        <div>
                            <label className="block text-xs text-purple-200/50 uppercase tracking-wider mb-1.5 font-medium">User UID</label>
                            <input
                                type="text"
                                value={uid}
                                onChange={(e) => setUid(e.target.value)}
                                placeholder="Enter LoginRadius UID"
                                className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white text-sm placeholder-purple-300/30 focus:outline-none focus:ring-2 focus:ring-purple-400/50 transition-all"
                            />
                        </div>

                        <div>
                            <label className="block text-xs text-purple-200/50 uppercase tracking-wider mb-1.5 font-medium">Role</label>
                            <select
                                value={selectedRole}
                                onChange={(e) => setSelectedRole(e.target.value)}
                                className="w-full px-4 py-2.5 bg-slate-900/50 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-400/50 transition-all appearance-none"
                            >
                                <option value="administrator" className="bg-slate-900">Administrator</option>
                                <option value="user" className="bg-slate-900">User</option>
                                <option value="observer" className="bg-slate-900">Observer</option>
                            </select>
                        </div>

                        <button
                            onClick={handleAssignRole}
                            disabled={assigning || !uid.trim()}
                            className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 disabled:from-gray-600 disabled:to-gray-600 text-white font-medium rounded-lg transition-all text-sm"
                        >
                            {assigning ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                                <UserPlus className="w-4 h-4" />
                            )}
                            Assign Role
                        </button>
                    </div>

                    {result && (
                        <div className="mt-4 p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
                            <p className="text-green-300 text-sm flex items-center gap-2">
                                <CheckCircle className="w-4 h-4" />
                                {result}
                            </p>
                        </div>
                    )}

                    {error && (
                        <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                            <p className="text-red-300 text-sm flex items-center gap-2">
                                <AlertCircle className="w-4 h-4" />
                                {error}
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

/* ─────────── Organizations Panel ─────────── */
function OrganizationsPanel() {
    const { allOrganizations, loadAllOrgs, createOrg, deleteOrg } = useOrg()
    const [newOrgName, setNewOrgName] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState<string | null>(null)

    useEffect(() => {
        loadAllOrgs()
    }, [loadAllOrgs])


    const handleCreateOrg = async () => {
        if (!newOrgName.trim()) return
        try {
            setLoading(true)
            setError(null)
            await createOrg(newOrgName.trim())
            setSuccess(`Organization "${newOrgName}" created`)
            setNewOrgName('')
        } catch (err: any) {
            setError(err.message || 'Failed to create organization')
        } finally {
            setLoading(false)
        }
    }

    const handleDeleteOrg = async (id: string, name: string) => {
        if (!window.confirm(`Are you sure you want to delete organization "${name}"?`)) return
        try {
            setLoading(true)
            await deleteOrg(id)
            setSuccess(`Organization "${name}" deleted`)
        } catch (err: any) {
            setError(err.message || 'Failed to delete organization')
        } finally {
            setLoading(false)
        }
    }


    return (
        <div className="flex-1 p-8 overflow-y-auto bg-gradient-to-b from-slate-950 to-slate-900">
            <div className="max-w-4xl mx-auto">
                <header className="mb-8">
                    <h2 className="text-2xl font-bold text-white mb-2">Organizations</h2>
                    <p className="text-purple-200/50 text-sm">Manage multi-tenant organizations and their members using LoginRadius Organization APIs</p>
                </header>

                {success && (
                    <div className="mb-6 p-4 bg-green-500/10 border border-green-500/20 rounded-lg flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-green-400" />
                        <p className="text-green-300 text-sm">{success}</p>
                        <button onClick={() => setSuccess(null)} className="ml-auto text-green-300/50 hover:text-green-300 text-xs">✕</button>
                    </div>
                )}
                {error && (
                    <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 text-red-400" />
                        <p className="text-red-300 text-sm">{error}</p>
                        <button onClick={() => setError(null)} className="ml-auto text-red-300/50 hover:text-red-300 text-xs">✕</button>
                    </div>
                )}

                <div className="grid grid-cols-1 gap-6 mb-8">
                    {/* Create Organization */}
                    <section className="bg-white/5 border border-white/10 rounded-xl p-6">
                        <h3 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
                            <Plus className="w-4 h-4 text-purple-400" />
                            Create Organization
                        </h3>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs text-purple-200/50 uppercase tracking-wider mb-1.5 font-medium">Org Name</label>
                                <input
                                    type="text"
                                    value={newOrgName}
                                    onChange={(e) => setNewOrgName(e.target.value)}
                                    placeholder="e.g. Acme Corp"
                                    className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white text-sm placeholder-purple-300/30 focus:outline-none focus:ring-2 focus:ring-purple-400/50 transition-all"
                                />
                            </div>
                            <button
                                onClick={handleCreateOrg}
                                disabled={loading || !newOrgName.trim()}
                                className="w-full flex items-center justify-center gap-2 px-5 py-2.5 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 text-white font-medium rounded-lg transition-all text-sm"
                            >
                                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Building2 className="w-4 h-4" />}
                                Create Org
                            </button>
                        </div>
                    </section>

                </div>

                {/* Org List */}
                <section className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
                    <div className="px-6 py-4 border-b border-white/10 bg-white/[0.02]">
                        <h3 className="text-base font-semibold text-white">Existing Organizations</h3>
                    </div>
                    <div className="divide-y divide-white/5">
                        {allOrganizations.length === 0 ? (
                            <div className="p-12 text-center">
                                <Building2 className="w-12 h-12 text-purple-300/20 mx-auto mb-4" />
                                <p className="text-purple-200/40 text-sm italic">No organizations found</p>
                            </div>
                        ) : (
                            allOrganizations.map(org => (
                                <div key={org.Id} className="px-6 py-4 flex items-center justify-between hover:bg-white/[0.02] transition-colors group">
                                    <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 bg-purple-500/10 border border-purple-500/20 rounded-lg flex items-center justify-center">
                                            <Building2 className="w-5 h-5 text-purple-400" />
                                        </div>
                                        <div>
                                            <p className="text-sm font-semibold text-white">{org.Name}</p>
                                            <p className="text-xs text-purple-200/30 font-mono">ID: {org.Id}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className="text-right mr-4">
                                            <span className="inline-block px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 text-[10px] font-bold uppercase tracking-wider">
                                                Active
                                            </span>
                                        </div>
                                        <button
                                            onClick={() => handleDeleteOrg(org.Id, org.Name)}
                                            className="p-2 text-purple-200/20 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </section>
            </div>
        </div>
    )
}

export default function AdminDashboard() {
    return (
        <RouteGuard allowedRoles={['administrator', 'user', 'observer']}>
            <AdminPage />
        </RouteGuard>
    )
}
