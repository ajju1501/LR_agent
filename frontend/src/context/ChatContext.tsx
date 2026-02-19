'use client'

import { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react'
import { ChatSession, Message } from '@/lib/types'
import { apiClient } from '@/lib/api'
import { useOrg } from './OrgContext'

interface ChatContextType {
  currentSessionId: string | null
  messages: Message[]
  isLoading: boolean
  error: string | null
  sessions: ChatSession[]
  createSession: () => Promise<void>
  sendMessage: (message: string) => Promise<void>
  loadHistory: (sessionId: string) => Promise<void>
  deleteSession: (sessionId: string) => Promise<void>
  loadSessions: () => Promise<void>
  clearError: () => void
}

const ChatContext = createContext<ChatContextType | undefined>(undefined)

export function ChatProvider({ children }: { children: ReactNode }) {
  const { currentOrg } = useOrg()
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sessions, setSessions] = useState<ChatSession[]>([])



  const createSession = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)
      const session = await apiClient.createSession()
      setCurrentSessionId(session.id)
      setMessages([])
      setSessions(prev => [session, ...prev])
    } catch (err: any) {
      setError(err.message || 'Failed to create session')
    } finally {
      setIsLoading(false)
    }
  }, [])

  const sendMessage = useCallback(
    async (message: string) => {
      if (!message.trim()) return

      try {
        setIsLoading(true)
        setError(null)

        // Lazily create a session if one doesn't exist yet
        let sessionId = currentSessionId
        if (!sessionId) {
          const session = await apiClient.createSession()
          sessionId = session.id
          setCurrentSessionId(sessionId)
          setSessions(prev => [session, ...prev])
        }

        const response = await apiClient.sendMessage(sessionId, message)

        // Add user message
        setMessages(prev => [
          ...prev,
          {
            id: response.messageId,
            sessionId: sessionId!,
            role: 'user',
            content: message,
            timestamp: new Date(),
          },
        ])

        // Add assistant response
        setMessages(prev => [
          ...prev,
          {
            id: response.id,
            sessionId: sessionId!,
            role: 'assistant',
            content: response.answer,
            timestamp: response.timestamp,
            metadata: {
              sources: response.sources,
              confidence: response.confidence,
            },
          },
        ])
      } catch (err: any) {
        setError(err.message || 'Failed to send message')
      } finally {
        setIsLoading(false)
      }
    },
    [currentSessionId]
  )

  const loadHistory = useCallback(async (sessionId: string) => {
    try {
      setIsLoading(true)
      setError(null)
      const history = await apiClient.getChatHistory(sessionId)
      setCurrentSessionId(sessionId)
      setMessages(history)
    } catch (err: any) {
      setError(err.message || 'Failed to load history')
    } finally {
      setIsLoading(false)
    }
  }, [])

  const deleteSession = useCallback(async (sessionId: string) => {
    try {
      setIsLoading(true)
      setError(null)
      await apiClient.deleteSession(sessionId)
      setSessions(prev => prev.filter(s => s.id !== sessionId))
      if (currentSessionId === sessionId) {
        setCurrentSessionId(null)
        setMessages([])
      }
    } catch (err: any) {
      setError(err.message || 'Failed to delete session')
    } finally {
      setIsLoading(false)
    }
  }, [currentSessionId])

  const loadSessions = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)
      const userSessions = await apiClient.getSessions()
      setSessions(userSessions)
    } catch (err: any) {
      setError(err.message || 'Failed to load sessions')
    } finally {
      setIsLoading(false)
    }
  }, [])

  const clearError = useCallback(() => {
    setError(null)
  }, [])

  // Clear and reload chat state when organization changes
  useEffect(() => {
    setCurrentSessionId(null)
    setMessages([])
    setSessions([]) // Clear sessions immediately
    loadSessions()
  }, [currentOrg?.OrgId, loadSessions])

  return (
    <ChatContext.Provider
      value={{
        currentSessionId,
        messages,
        isLoading,
        error,
        sessions,
        createSession,
        sendMessage,
        loadHistory,
        deleteSession,
        loadSessions,
        clearError,
      }}
    >
      {children}
    </ChatContext.Provider>
  )
}

export function useChat() {
  const context = useContext(ChatContext)
  if (!context) {
    throw new Error('useChat must be used within ChatProvider')
  }
  return context
}
