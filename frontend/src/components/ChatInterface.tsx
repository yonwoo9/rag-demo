import React, { useState, useRef, useEffect, useCallback } from 'react'
import { Send, StopCircle, Trash2, MessageSquare, ChevronDown, BookOpen, X, Check } from 'lucide-react'
import { MessageBubble } from './MessageBubble'
import { streamChat, documentApi } from '../services/api'
import type { ChatMessage, Source, DocumentInfo } from '../types'

let msgIdCounter = 0
const newId = () => `msg_${++msgIdCounter}`

interface SelectedDoc {
  doc_id: string
  doc_name: string
}

export function ChatInterface() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [topK] = useState(5)

  // 文档选择
  const [docs, setDocs] = useState<DocumentInfo[]>([])
  const [selectedDoc, setSelectedDoc] = useState<SelectedDoc | null>(null)
  const [selectorOpen, setSelectorOpen] = useState(false)

  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const stopRef = useRef<(() => void) | null>(null)
  const selectorRef = useRef<HTMLDivElement>(null)
  // 记录上一次的检索范围，用于检测切换
  const prevSelectedDocRef = useRef<SelectedDoc | null | undefined>(undefined)

  // 加载文档列表
  useEffect(() => {
    documentApi.list().then(setDocs).catch(() => {})
  }, [])

  // 点击外部关闭下拉
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (selectorRef.current && !selectorRef.current.contains(e.target as Node)) {
        setSelectorOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // 检索范围切换时：停止正在生成的内容，清除旧对话，插入分隔系统消息
  useEffect(() => {
    // undefined 表示初次挂载，跳过
    if (prevSelectedDocRef.current === undefined) {
      prevSelectedDocRef.current = selectedDoc
      return
    }
    // 范围未变化，跳过
    if (prevSelectedDocRef.current?.doc_id === selectedDoc?.doc_id) {
      prevSelectedDocRef.current = selectedDoc
      return
    }

    // 停止正在进行的流式输出
    if (stopRef.current) {
      stopRef.current()
      stopRef.current = null
      setIsLoading(false)
    }

    const scopeLabel = selectedDoc
      ? `已切换至《${selectedDoc.doc_name}》`
      : '已切换至全部文档'

    // 保留当前对话记录，仅追加分隔线 + 清除之前的 user/assistant 上下文
    setMessages((prev) => {
      // 如果之前没有对话，不插入分隔线
      if (prev.filter((m) => m.role !== 'system').length === 0) {
        prevSelectedDocRef.current = selectedDoc
        return prev
      }
      return [
        ...prev,
        {
          id: newId(),
          role: 'system' as const,
          content: `${scopeLabel}，以下为新对话`,
        },
      ]
    })

    prevSelectedDocRef.current = selectedDoc
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDoc])

  const handleSend = useCallback(() => {
    const text = input.trim()
    if (!text || isLoading) return

    const userMsg: ChatMessage = { id: newId(), role: 'user', content: text }
    const assistantId = newId()
    const assistantMsg: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      isStreaming: true,
      sources: [],
    }

    setMessages((prev) => [...prev, userMsg, assistantMsg])
    setInput('')
    setIsLoading(true)

    // 只取最后一个 system 分隔线之后的 user/assistant 消息作为上下文
    const allWithUser = [...messages, userMsg]
    const lastSysIdx = allWithUser.map((m) => m.role).lastIndexOf('system')
    const contextMessages = allWithUser
      .slice(lastSysIdx + 1)
      .filter((m) => m.role !== 'system')

    const stop = streamChat(
      contextMessages,
      topK,
      selectedDoc?.doc_id ?? null,
      {
        onSources: (sources?: Source[]) => {
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, sources: sources || [] } : m))
          )
        },
        onContent: (content: string) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, content: m.content + content } : m
            )
          )
        },
        onDone: () => {
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, isStreaming: false } : m))
          )
          setIsLoading(false)
          stopRef.current = null
        },
        onError: (msg: string) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, content: `请求失败: ${msg}`, isStreaming: false, error: msg }
                : m
            )
          )
          setIsLoading(false)
          stopRef.current = null
        },
      }
    )

    stopRef.current = stop
  }, [input, isLoading, messages, topK, selectedDoc])

  const handleStop = () => {
    stopRef.current?.()
    stopRef.current = null
    setMessages((prev) =>
      prev.map((m) => (m.isStreaming ? { ...m, isStreaming: false } : m))
    )
    setIsLoading(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const clearMessages = () => {
    if (messages.length === 0) return
    if (confirm('确定清空所有对话记录吗？')) setMessages([])
  }

  const selectDoc = (doc: DocumentInfo | null) => {
    setSelectedDoc(doc ? { doc_id: doc.doc_id, doc_name: doc.doc_name } : null)
    setSelectorOpen(false)
  }

  const truncateName = (name: string, max = 28) =>
    name.length > max ? name.slice(0, max) + '…' : name

  return (
    <div className="flex flex-col h-full">
      {/* 顶部工具栏 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-white">
        <div className="flex items-center gap-2">
          <MessageSquare size={18} className="text-blue-500" />
          <span className="font-semibold text-gray-700">智能问答</span>
          {messages.length > 0 && (
            <span className="text-xs text-gray-400">
              {Math.floor(messages.length / 2)} 轮对话
            </span>
          )}
        </div>
        {messages.length > 0 && (
          <button
            onClick={clearMessages}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600
              px-2 py-1 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <Trash2 size={12} />
            清空对话
          </button>
        )}
      </div>

      {/* 消息区域 */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center select-none">
            <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mb-4">
              <MessageSquare size={32} className="text-blue-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-700 mb-2">开始问答</h3>
            <p className="text-sm text-gray-400 max-w-xs mb-1">
              可在下方选择检索范围，针对单个文档提问
            </p>
            <p className="text-sm text-gray-400 max-w-xs">
              默认对全部文档进行检索
            </p>
            <div className="mt-6 flex flex-wrap gap-2 justify-center">
              {['这些文档主要讲什么？', '帮我总结重点内容', '有哪些关键概念？'].map((q) => (
                <button
                  key={q}
                  onClick={() => setInput(q)}
                  className="text-xs px-3 py-1.5 bg-blue-50 text-blue-600 rounded-full
                    hover:bg-blue-100 transition-colors border border-blue-100"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg) => <MessageBubble key={msg.id} message={msg} />)
        )}
        <div ref={bottomRef} />
      </div>

      {/* 底部：文档选择器 + 输入框 */}
      <div className="border-t border-gray-100 bg-white">
        {/* 文档选择器 */}
        <div className="px-4 pt-3 pb-1 flex items-center gap-2">
          <BookOpen size={13} className="text-gray-400 flex-shrink-0" />
          <span className="text-xs text-gray-400 flex-shrink-0">检索范围</span>

          <div className="relative" ref={selectorRef}>
            <button
              onClick={() => setSelectorOpen((o) => !o)}
              className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border transition-colors
                ${selectedDoc
                  ? 'bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100'
                  : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                }`}
            >
              <span className="max-w-[200px] truncate">
                {selectedDoc ? truncateName(selectedDoc.doc_name) : '全部文档'}
              </span>
              {selectedDoc ? (
                <X
                  size={11}
                  className="flex-shrink-0 hover:text-red-500"
                  onClick={(e) => { e.stopPropagation(); setSelectedDoc(null) }}
                />
              ) : (
                <ChevronDown size={11} className={`flex-shrink-0 transition-transform ${selectorOpen ? 'rotate-180' : ''}`} />
              )}
            </button>

            {/* 下拉菜单 */}
            {selectorOpen && (
              <div className="absolute bottom-full mb-1.5 left-0 z-20 bg-white border border-gray-200
                rounded-xl shadow-lg py-1 min-w-[220px] max-w-[320px] max-h-52 overflow-y-auto">
                {/* 全部文档选项 */}
                <button
                  onClick={() => selectDoc(null)}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-gray-50 transition-colors
                    ${!selectedDoc ? 'text-blue-600 font-medium' : 'text-gray-700'}`}
                >
                  <div className={`w-3.5 h-3.5 flex-shrink-0 rounded-full border flex items-center justify-center
                    ${!selectedDoc ? 'border-blue-500 bg-blue-500' : 'border-gray-300'}`}>
                    {!selectedDoc && <Check size={9} className="text-white" />}
                  </div>
                  <span>全部文档</span>
                  <span className="ml-auto text-gray-400">{docs.length} 个</span>
                </button>

                {docs.length > 0 && <div className="border-t border-gray-100 my-1" />}

                {docs.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-gray-400 text-center">暂无文档</p>
                ) : (
                  docs.map((doc) => {
                    const isSelected = selectedDoc?.doc_id === doc.doc_id
                    return (
                      <button
                        key={doc.doc_id}
                        onClick={() => selectDoc(doc)}
                        className={`w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-gray-50 transition-colors
                          ${isSelected ? 'text-blue-600 font-medium' : 'text-gray-700'}`}
                      >
                        <div className={`w-3.5 h-3.5 flex-shrink-0 rounded-full border flex items-center justify-center
                          ${isSelected ? 'border-blue-500 bg-blue-500' : 'border-gray-300'}`}>
                          {isSelected && <Check size={9} className="text-white" />}
                        </div>
                        <span className="truncate flex-1 text-left">{doc.doc_name}</span>
                        <span className={`ml-1 px-1 py-0.5 rounded text-[10px] flex-shrink-0
                          ${isSelected ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-400'}`}>
                          {doc.doc_type.toUpperCase()}
                        </span>
                      </button>
                    )
                  })
                )}
              </div>
            )}
          </div>
        </div>

        {/* 输入框 */}
        <div className="px-4 pb-3">
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="输入问题，Enter 发送，Shift+Enter 换行..."
              rows={1}
              disabled={isLoading}
              className="flex-1 resize-none rounded-xl border border-gray-200 px-4 py-3 text-sm
                focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-300
                disabled:bg-gray-50 disabled:text-gray-400 transition-all
                max-h-32 overflow-y-auto"
              style={{ minHeight: '48px' }}
              onInput={(e) => {
                const el = e.currentTarget
                el.style.height = 'auto'
                el.style.height = Math.min(el.scrollHeight, 128) + 'px'
              }}
            />
            {isLoading ? (
              <button
                onClick={handleStop}
                className="flex-shrink-0 p-3 bg-red-500 text-white rounded-xl
                  hover:bg-red-600 transition-colors"
                title="停止生成"
              >
                <StopCircle size={18} />
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={!input.trim()}
                className="flex-shrink-0 p-3 bg-blue-500 text-white rounded-xl
                  hover:bg-blue-600 disabled:bg-gray-200 disabled:cursor-not-allowed transition-colors"
                title="发送 (Enter)"
              >
                <Send size={18} />
              </button>
            )}
          </div>
          <p className="text-xs text-gray-300 mt-1.5 text-right">
            基于 GLM + Milvus RAG 驱动
          </p>
        </div>
      </div>
    </div>
  )
}
