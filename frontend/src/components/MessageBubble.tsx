'use client'

import { Message } from '@/lib/types'
import ReactMarkdown from 'react-markdown'
import { Copy, CheckCircle2, ExternalLink, BookOpen } from 'lucide-react'
import { useState, useCallback } from 'react'

interface MessageBubbleProps {
  message: Message
}

export default function MessageBubble({ message }: MessageBubbleProps) {
  const [copied, setCopied] = useState(false)
  const [copiedCodeIdx, setCopiedCodeIdx] = useState<number | null>(null)
  const isUser = message.role === 'user'
  const sources = message.metadata?.sources || []
  const confidence = message.metadata?.confidence

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  let codeBlockCounter = 0
  const handleCopyCode = useCallback((code: string, idx: number) => {
    navigator.clipboard.writeText(code)
    setCopiedCodeIdx(idx)
    setTimeout(() => setCopiedCodeIdx(null), 2000)
  }, [])

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} message`}>
      <div className={`max-w-2xl ${isUser ? 'bg-blue-600 text-white rounded-2xl rounded-tr-none' : 'bg-white text-gray-900 rounded-2xl rounded-tl-none shadow-sm border border-gray-200'} px-5 py-4`}>
        {/* Message Content */}
        <div className={`prose prose-sm ${isUser ? 'prose-invert' : ''} max-w-none`}>
          {isUser ? (
            <p className="text-sm leading-relaxed">{message.content}</p>
          ) : (
            <ReactMarkdown
              components={{
                p: ({ node, ...props }) => <p className="text-sm leading-relaxed mb-2 last:mb-0" {...props} />,
                ul: ({ node, ...props }) => <ul className="text-sm leading-relaxed mb-2 last:mb-0 list-disc ml-4" {...props} />,
                ol: ({ node, ...props }) => <ol className="text-sm leading-relaxed mb-2 last:mb-0 list-decimal ml-4" {...props} />,
                li: ({ node, ...props }) => <li className="mb-1" {...props} />,
                pre: ({ node, children, ...props }) => {
                  const codeIdx = codeBlockCounter++
                  // Extract text content from children
                  const codeText = extractText(children)
                  return (
                    <div className="relative group mb-3">
                      <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => handleCopyCode(codeText, codeIdx)}
                          className="flex items-center gap-1 px-2 py-1 text-xs bg-gray-700 text-gray-200 rounded hover:bg-gray-600 transition-colors"
                        >
                          {copiedCodeIdx === codeIdx ? (
                            <><CheckCircle2 className="w-3 h-3" /> Copied</>
                          ) : (
                            <><Copy className="w-3 h-3" /> Copy</>
                          )}
                        </button>
                      </div>
                      <pre className="bg-gray-900 text-green-300 p-4 rounded-lg text-xs font-mono overflow-x-auto leading-relaxed" {...props}>
                        {children}
                      </pre>
                    </div>
                  )
                },
                code: ({ node, inline, className, children, ...props }: any) => {
                  const language = className?.replace('language-', '') || ''
                  if (inline) {
                    return (
                      <code className="bg-gray-100 text-pink-600 px-1.5 py-0.5 rounded text-xs font-mono border border-gray-200" {...props}>
                        {children}
                      </code>
                    )
                  }
                  return (
                    <code className={`block text-xs font-mono ${language ? `language-${language}` : ''}`} {...props}>
                      {language && (
                        <span className="block text-gray-500 text-[10px] uppercase tracking-wider mb-1 font-sans">{language}</span>
                      )}
                      {children}
                    </code>
                  )
                },
                h1: ({ node, ...props }) => <h1 className="text-base font-bold mt-4 mb-2 text-gray-900" {...props} />,
                h2: ({ node, ...props }) => <h2 className="text-sm font-bold mt-3 mb-1.5 text-gray-800" {...props} />,
                h3: ({ node, ...props }) => <h3 className="text-sm font-semibold mt-2 mb-1 text-gray-700" {...props} />,
                a: ({ node, href, children, ...props }) => (
                  <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 underline decoration-blue-300 hover:decoration-blue-600 transition-colors" {...props}>
                    {children}
                  </a>
                ),
                blockquote: ({ node, ...props }) => (
                  <blockquote className="border-l-4 border-blue-400 bg-blue-50 pl-4 py-2 my-2 rounded-r text-sm text-gray-700 italic" {...props} />
                ),
                table: ({ node, ...props }) => (
                  <div className="overflow-x-auto my-2">
                    <table className="min-w-full text-xs border-collapse border border-gray-300 rounded" {...props} />
                  </div>
                ),
                th: ({ node, ...props }) => (
                  <th className="bg-gray-100 border border-gray-300 px-3 py-1.5 text-left font-semibold text-gray-700" {...props} />
                ),
                td: ({ node, ...props }) => (
                  <td className="border border-gray-300 px-3 py-1.5 text-gray-600" {...props} />
                ),
              }}
            >
              {message.content}
            </ReactMarkdown>
          )}
        </div>

        {/* Sources & Actions */}
        {!isUser && (
          <div className="mt-4 border-t border-gray-100 pt-3">
            {/* Confidence badge */}
            {confidence !== undefined && confidence > 0 && (
              <div className="mb-2">
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${confidence >= 0.8 ? 'bg-green-100 text-green-700' :
                    confidence >= 0.5 ? 'bg-yellow-100 text-yellow-700' :
                      'bg-red-100 text-red-700'
                  }`}>
                  {confidence >= 0.8 ? '✓ High confidence' :
                    confidence >= 0.5 ? '~ Moderate confidence' :
                      '? Low confidence'}
                </span>
              </div>
            )}

            {/* Sources */}
            {sources.length > 0 && (
              <div className="mb-3">
                <p className="text-xs font-semibold text-gray-500 mb-2 flex items-center gap-1">
                  <BookOpen className="w-3 h-3" />
                  Sources ({sources.length})
                </p>
                <div className="space-y-1.5">
                  {sources.map((source: any, idx: number) => (
                    <div key={idx} className="flex items-start gap-2 text-xs bg-gray-50 rounded-lg px-3 py-2 border border-gray-100">
                      <span className="font-mono text-blue-600 font-bold flex-shrink-0">[{idx + 1}]</span>
                      <div className="min-w-0 flex-1">
                        <span className="font-medium text-gray-800">{source.title}</span>
                        {source.relevanceScore > 0 && (
                          <span className="ml-2 text-[10px] text-gray-400">
                            {Math.round(source.relevanceScore * 100)}% match
                          </span>
                        )}
                        {source.excerpt && (
                          <p className="text-gray-500 mt-0.5 line-clamp-2 text-[11px] leading-snug">{source.excerpt}</p>
                        )}
                      </div>
                      {source.url && (
                        <a
                          href={source.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-shrink-0 text-blue-500 hover:text-blue-700 transition-colors"
                          title="Open source"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Copy Button */}
            <button
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-700 transition-colors"
            >
              {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copied!' : 'Copy response'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Extract plain text from React children (for code copy functionality)
 */
function extractText(children: any): string {
  if (typeof children === 'string') return children
  if (Array.isArray(children)) return children.map(extractText).join('')
  if (children?.props?.children) return extractText(children.props.children)
  return ''
}
