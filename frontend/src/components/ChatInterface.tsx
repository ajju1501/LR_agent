'use client'

import { useChat } from '@/context/ChatContext'
import MessageList from './MessageList'
import MessageInput from './MessageInput'
import Sidebar from './Sidebar'

export default function ChatInterface() {
  const { messages, isLoading, error, clearError } = useChat()

  return (
    <div className="h-screen flex bg-gray-50">
      {/* Sidebar */}
      <Sidebar />

      {/* Main Chat Area */}
      <main className="flex-1 flex flex-col">
        {/* Header */}
        <header className="bg-white border-b border-gray-200 px-6 py-4 shadow-sm">
          <h1 className="text-2xl font-bold text-gray-900">LoginRadius Chatbot</h1>
          <p className="text-sm text-gray-600 mt-1">Ask questions about LoginRadius documentation</p>
        </header>

        {/* Messages Area */}
        <div className="flex-1 overflow-hidden flex flex-col">
          <MessageList messages={messages} isLoading={isLoading} />

          {/* Error Message */}
          {error && (
            <div className="bg-red-50 border-t border-red-200 px-6 py-3 flex justify-between items-center">
              <p className="text-red-700 text-sm">{error}</p>
              <button
                onClick={clearError}
                className="text-red-600 hover:text-red-700 font-medium text-sm"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Input Area */}
          <MessageInput />
        </div>
      </main>
    </div>
  )
}
