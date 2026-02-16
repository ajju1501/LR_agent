'use client'

import ChatInterface from '@/components/ChatInterface'
import { ChatProvider } from '@/context/ChatContext'
import RouteGuard from '@/components/RouteGuard'

export default function ChatPage() {
  return (
    <RouteGuard allowedRoles={['administrator', 'user']}>
      <ChatProvider>
        <ChatInterface />
      </ChatProvider>
    </RouteGuard>
  )
}
