'use client'

import { useChat } from '@/context/ChatContext'
import { useEffect, useState } from 'react'
import { Plus, Trash2, Menu, LogOut } from 'lucide-react'

export default function Sidebar() {
  const { sessions, currentSessionId, createSession, deleteSession, loadHistory, loadSessions } = useChat()
  const [open, setOpen] = useState(true)

  useEffect(() => {
    loadSessions()
  }, [])

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
    localStorage.removeItem('lr_access_token')
    localStorage.removeItem('lr_refresh_token')
    localStorage.removeItem('lr_user')
    window.location.href = '/login'
  }

  // Try to get user info from localStorage
  let userName = 'User'
  let userRole = ''
  try {
    const stored = localStorage.getItem('lr_user')
    if (stored) {
      const parsed = JSON.parse(stored)
      userName = parsed.fullName || parsed.email || 'User'
      userRole = parsed.roles?.[0] || ''
    }
  } catch { }

  return (
    <>
      {/* Mobile Toggle */}
      <button
        onClick={() => setOpen(!open)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-white rounded-lg shadow-md"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Sidebar */}
      <aside
        className={`${open ? 'translate-x-0' : '-translate-x-full'
          } lg:translate-x-0 transition-transform fixed lg:static inset-y-0 left-0 w-64 bg-gray-900 text-white flex flex-col z-40`}
      >
        {/* Header */}
        <div className="p-4 border-b border-gray-700">
          <button
            onClick={handleNewChat}
            className="w-full flex items-center justify-center gap-2 bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg transition-colors font-medium text-sm"
          >
            <Plus className="w-4 h-4" />
            New Chat
          </button>
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
              {userRole && (
                <p className="text-xs text-gray-400 capitalize">{userRole}</p>
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
