'use client'

import { useAuth } from '@/context/AuthContext'
import { ChatProvider } from '@/context/ChatContext'
import RouteGuard from '@/components/RouteGuard'
import ChatInterface from '@/components/ChatInterface'
import { useState, useEffect } from 'react'
import { apiClient } from '@/lib/api'
import {
    Shield, MessageSquare, FolderOpen, Users, Settings,
    LogOut, Globe, Loader2, CheckCircle, AlertCircle,
    Database, FileText, UserPlus, Upload, Github, Trash2
} from 'lucide-react'

function AdminPage() {
    const { user, logout } = useAuth()
    const [activeTab, setActiveTab] = useState<'chat' | 'documents' | 'users'>('chat')

    return (
        <div className="h-screen flex bg-slate-950">
            {/* Admin Sidebar */}
            <aside className="w-64 bg-gradient-to-b from-slate-900 to-slate-950 border-r border-white/5 flex flex-col">
                {/* Logo */}
                <div className="p-5 border-b border-white/5">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-gradient-to-br from-purple-400 to-blue-500 rounded-lg flex items-center justify-center">
                            <Shield className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h1 className="text-sm font-bold text-white">Admin Panel</h1>
                            <p className="text-xs text-purple-300/60">Administrator</p>
                        </div>
                    </div>
                </div>

                {/* Nav */}
                <nav className="flex-1 p-3 space-y-1">
                    {[
                        { id: 'chat', label: 'Chatbot', icon: MessageSquare },
                        { id: 'documents', label: 'Documents', icon: FolderOpen },
                        { id: 'users', label: 'User Management', icon: Users },
                    ].map(({ id, label, icon: Icon }) => (
                        <button
                            key={id}
                            onClick={() => setActiveTab(id as any)}
                            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${activeTab === id
                                ? 'bg-purple-500/20 text-purple-200 border border-purple-500/30'
                                : 'text-purple-200/50 hover:text-purple-200 hover:bg-white/5'
                                }`}
                        >
                            <Icon className="w-4 h-4" />
                            {label}
                        </button>
                    ))}
                </nav>

                {/* User info + logout */}
                <div className="p-4 border-t border-white/5">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="w-8 h-8 bg-gradient-to-br from-green-400 to-emerald-500 rounded-full flex items-center justify-center text-white text-xs font-bold">
                            {user?.firstName?.[0] || user?.email?.[0]?.toUpperCase() || 'A'}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm text-white font-medium truncate">{user?.fullName || user?.email}</p>
                            <p className="text-xs text-purple-300/50">{user?.roles?.[0]}</p>
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
                {activeTab === 'chat' && (
                    <ChatProvider>
                        <ChatInterface />
                    </ChatProvider>
                )}

                {activeTab === 'documents' && <DocumentsPanel />}
                {activeTab === 'users' && <UsersPanel />}
            </main>
        </div>
    )
}

/* ─────────── Documents Panel ─────────── */
function DocumentsPanel() {
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
    }, [])

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
                <h2 className="text-2xl font-bold text-white mb-2">Knowledge Base</h2>
                <p className="text-purple-200/50 text-sm mb-8">Upload PDFs, add GitHub repos, or scrape docs to enrich the chatbot&apos;s knowledge</p>

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

                {/* ──── PDF Upload ──── */}
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

                {/* ──── GitHub Repo ──── */}
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

                {/* ──── Scrape LoginRadius Docs ──── */}
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
                            <p className="text-purple-200/20 text-xs mt-1">Upload a PDF or add a GitHub repo to get started</p>
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

                                    <button
                                        onClick={() => handleDeleteResource(r.id)}
                                        className="p-2 text-purple-200/30 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all rounded-lg hover:bg-red-500/10"
                                        title="Delete resource"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
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

                {/* Setup roles (one-time) */}
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
                                className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-400/50 transition-all appearance-none"
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

export default function AdminDashboard() {
    return (
        <RouteGuard allowedRoles={['administrator']}>
            <AdminPage />
        </RouteGuard>
    )
}
