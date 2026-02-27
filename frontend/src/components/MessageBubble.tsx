import React from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Bot, User, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react'
import type { ChatMessage } from '../types'

interface MessageBubbleProps {
  message: ChatMessage
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const [showSources, setShowSources] = React.useState(false)

  // 系统提示：范围切换分隔线
  if (message.role === 'system') {
    return (
      <div className="flex items-center gap-3 py-1 select-none">
        <div className="flex-1 border-t border-dashed border-gray-200" />
        <span className="text-xs text-gray-400 bg-gray-50 px-2.5 py-1 rounded-full border border-gray-200 whitespace-nowrap flex-shrink-0">
          {message.content}
        </span>
        <div className="flex-1 border-t border-dashed border-gray-200" />
      </div>
    )
  }
  const isUser = message.role === 'user'

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      {/* 头像 */}
      <div
        className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white
          ${isUser ? 'bg-blue-500' : 'bg-emerald-500'}`}
      >
        {isUser ? <User size={16} /> : <Bot size={16} />}
      </div>

      {/* 消息内容 */}
      <div className={`max-w-[80%] flex flex-col gap-2 ${isUser ? 'items-end' : 'items-start'}`}>
        <div
          className={`px-4 py-3 rounded-2xl text-sm leading-relaxed
            ${isUser
              ? 'bg-blue-500 text-white rounded-tr-sm'
              : message.error
              ? 'bg-red-50 text-red-700 border border-red-200 rounded-tl-sm'
              : 'bg-white text-gray-800 border border-gray-100 shadow-sm rounded-tl-sm'
            }`}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap">{message.content}</p>
          ) : (
            <div className="markdown-content">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {message.content || ''}
              </ReactMarkdown>
              {message.isStreaming && <span className="cursor-blink" />}
            </div>
          )}
        </div>

        {/* 引用来源 */}
        {!isUser && message.sources && message.sources.length > 0 && !message.isStreaming && (
          <div className="w-full">
            <button
              onClick={() => setShowSources(!showSources)}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 transition-colors"
            >
              <ExternalLink size={12} />
              <span>参考了 {message.sources.length} 个来源</span>
              {showSources ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>

            {showSources && (
              <div className="mt-2 space-y-2">
                {message.sources.map((src, i) => (
                  <div
                    key={i}
                    className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-xs"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-blue-700 truncate max-w-[200px]">
                        《{src.doc_name}》
                      </span>
                      <span className="text-blue-400 ml-2 flex-shrink-0">
                        相关度 {(src.score * 100).toFixed(0)}%
                      </span>
                    </div>
                    <p className="text-gray-600 line-clamp-3">{src.content}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
