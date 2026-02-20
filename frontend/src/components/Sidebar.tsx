'use client'

import { useChat } from '@/context/ChatContext'
import { useOrg } from '@/context/OrgContext'
import { useAuth } from '@/context/AuthContext'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, Menu, LogOut, Building2, ChevronDown } from 'lucide-react'

export default function Sidebar() {
  const { user, logout } = useAuth()
  const { sessions, currentSessionId, createSession, deleteSession, loadHistory } = useChat()
  const { organizations, allOrganizations, currentOrg, switchOrg, loadAllOrgs, loadMyOrgs, isTenantAdmin, currentOrgRole, availableOrgRoles, switchOrgRole } = useOrg()
  const router = useRouter()
  const [open, setOpen] = useState(true)
  const [showOrgDropdown, setShowOrgDropdown] = useState(false)

  // Show admin link if user is tenant admin or org admin of any org
  const isAdmin = isTenantAdmin
  const showAdminLink = isTenantAdmin || currentOrgRole === 'administrator' || organizations.some(o => o.EffectiveRole === 'administrator')

  // Use allOrganizations for admins, otherwise just the memberships
  const displayOrgs = isAdmin ? allOrganizations.map(o => ({ OrgId: o.Id, OrgName: o.Name })) : organizations

  useEffect(() => {
    if (isAdmin) {
      loadAllOrgs()
    } else {
      loadMyOrgs()
    }
  }, [isAdmin, loadAllOrgs, loadMyOrgs])

  const handleNewChat = async () => {
    await createSession()
  }

  const handleSelectSession = (sessionId: string) => {
    loadHistory(sessionId)
  }

  const handleDeleteSession = (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation()
    if (window.confirm('Are you sure you want to delete this conversation?')) {
      deleteSession(sessionId)
    }
  }

  const handleLogout = () => {
    logout()
  }

  // Display user info
  const userName = user?.fullName || user?.email || 'User'
  const userRoles = user?.roles || []

  return (
    <>
      {/* Mobile Toggle */}
      <button
        onClick={() => setOpen(!open)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-white rounded-lg shadow-md"
      >
        <Menu className="w-5 h-5 text-gray-900" />
      </button>

      {/* Sidebar */}
      <aside
        className={`${open ? 'translate-x-0' : '-translate-x-full'
          } lg:translate-x-0 transition-transform fixed lg:static inset-y-0 left-0 w-64 bg-gray-900 text-white flex flex-col z-40`}
      >
        {/* Header */}
        <div className="p-4 border-b border-gray-700 space-y-4">
          <button
            onClick={handleNewChat}
            className="w-full flex items-center justify-center gap-2 bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg transition-colors font-medium text-sm"
          >
            <Plus className="w-4 h-4" />
            New Chat
          </button>

          {/* Organization Switcher */}
          {(displayOrgs.length > 0 || isAdmin) && (
            <div className="relative">
              <button
                onClick={() => setShowOrgDropdown(!showOrgDropdown)}
                className="w-full flex items-center justify-between gap-2 bg-gray-800/50 hover:bg-gray-800 border border-gray-700 text-gray-200 px-3 py-2 rounded-lg transition-all text-xs font-medium"
              >
                <div className="flex items-center gap-2 truncate">
                  <Building2 className="w-3.5 h-3.5 text-blue-400" />
                  <span className="truncate">{currentOrg?.OrgName || 'Select Organization'}</span>
                </div>
                <ChevronDown className={`w-3 h-3 transition-transform ${showOrgDropdown ? 'rotate-180' : ''}`} />
              </button>

              {showOrgDropdown && (
                <div className="absolute top-full left-0 w-full mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50 max-h-48 overflow-y-auto">
                  {displayOrgs.length === 0 && (
                    <div className="px-3 py-2 text-[10px] text-gray-500 italic">No organizations available</div>
                  )}
                  {displayOrgs.map(org => (
                    <button
                      key={org.OrgId}
                      onClick={() => {
                        switchOrg(org.OrgId)
                        setShowOrgDropdown(false)

                        // Auto-navigate based on user's role in the selected org
                        const fullOrg = organizations.find(o => o.OrgId === org.OrgId)
                        const effectiveRole = fullOrg?.EffectiveRole
                        if (isTenantAdmin || effectiveRole === 'administrator') {
                          router.push('/admin')
                        } else if (effectiveRole === 'observer') {
                          router.push('/dashboard')
                        }
                        // 'user' role stays on /chat (current page)
                      }}
                      className={`w-full text-left px-3 py-2 text-xs transition-colors hover:bg-gray-700 ${currentOrg?.OrgId === org.OrgId ? 'text-blue-400 bg-gray-700/50' : 'text-gray-300'
                        }`}
                    >
                      {org.OrgName}
                    </button>
                  ))}
                  {showAdminLink && (
                    <div className="border-t border-gray-700 mt-1 p-2">
                      <button
                        onClick={() => window.location.href = '/admin'}
                        className="w-full text-[10px] text-blue-400 hover:underline text-left"
                      >
                        {isTenantAdmin ? 'Tenant Admin Panel →' : 'Management Panel →'}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Role Switcher — shows when org has multiple roles */}
          {currentOrg && availableOrgRoles.length > 1 && (
            <div className="mt-1">
              <select
                value={currentOrgRole || ''}
                onChange={(e) => {
                  const role = e.target.value as any
                  switchOrgRole(role)
                  // Navigate to the correct page for the selected role
                  if (role === 'administrator') {
                    router.push('/admin')
                  } else if (role === 'observer') {
                    router.push('/dashboard')
                  }
                  // 'user' stays on /chat (current page)
                }}
                className="w-full bg-gray-800/50 border border-gray-700 text-gray-200 px-3 py-1.5 rounded-lg text-[11px] appearance-none cursor-pointer focus:ring-1 focus:ring-blue-500/50 outline-none"
              >
                {availableOrgRoles.map(role => (
                  <option key={role} value={role} className="bg-gray-800 capitalize">
                    {role.charAt(0).toUpperCase() + role.slice(1)}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Chat History */}
        <div className="flex-1 overflow-y-auto p-4">
          <p className="text-xs font-semibold text-gray-400 mb-3 uppercase tracking-wide">Recent Chats</p>
          <div className="space-y-2">
            {sessions.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">No conversations yet</p>
            ) : (
              sessions.map(session => (
                <div
                  key={session.id}
                  onClick={() => handleSelectSession(session.id)}
                  className={`group p-3 rounded-lg cursor-pointer transition-colors ${currentSessionId === session.id
                    ? 'bg-gray-700 text-white'
                    : 'hover:bg-gray-800 text-gray-300'
                    }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm flex-1 truncate">{session.title || 'New Chat'}</p>
                    <button
                      onClick={e => handleDeleteSession(e, session.id)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-gray-600 rounded"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">
                    {new Date(session.createdAt).toLocaleDateString()}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Footer with user info */}
        <div className="p-4 border-t border-gray-700 space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-400 to-indigo-500 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
              {userName[0]?.toUpperCase() || 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-white truncate">{userName}</p>
              {userRoles && (
                userRoles.map((role: string) => (
                  <p key={role} className="text-[10px] text-gray-400 capitalize bg-gray-800 px-1.5 py-0.5 rounded inline-block mr-1 mb-1">{role}</p>
                ))
              )}
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 px-3 py-1.5 bg-gray-800 border border-gray-700 text-gray-300 rounded-lg text-xs font-medium hover:bg-gray-700 hover:text-white transition-colors"
          >
            <LogOut className="w-3 h-3" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Mobile Overlay */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          className="lg:hidden fixed inset-0 bg-black/50 z-30"
        />
      )}
    </>
  )
}
