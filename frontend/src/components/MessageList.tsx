'use client'

import { Message } from '@/lib/types'
import MessageBubble from './MessageBubble'
import { useEffect, useRef } from 'react'
import { Loader2 } from 'lucide-react'

interface MessageListProps {
  messages: Message[]
  isLoading: boolean
}

export default function MessageList({ messages, isLoading }: MessageListProps) {
  const endOfMessagesRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endOfMessagesRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-gradient-to-b from-gray-50 to-white">
      {messages.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-full text-center">
          <div className="mb-4">
            <div className="inline-block p-4 bg-blue-100 rounded-lg">
              <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                />
              </svg>
            </div>
          </div>
          <p className="text-gray-600 text-lg font-medium mb-2">No messages yet</p>
          <p className="text-gray-500 text-sm">Start a conversation by typing your question below</p>
        </div>
      ) : (
        <>
          {messages.map(message => (
            <MessageBubble key={message.id} message={message} />
          ))}
          {isLoading && (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
              <span className="ml-2 text-sm text-gray-600">Thinking...</span>
            </div>
          )}
          <div ref={endOfMessagesRef} />
        </>
      )}
    </div>
  )
}
