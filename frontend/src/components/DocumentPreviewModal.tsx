import React, { useEffect, useRef } from 'react'
import { X, FileText, Layers, Copy, Check } from 'lucide-react'
import type { DocumentPreview } from '../types'

interface DocumentPreviewModalProps {
  preview: DocumentPreview
  onClose: () => void
}

const DOC_TYPE_COLORS: Record<string, string> = {
  pdf:  'bg-red-100 text-red-700',
  docx: 'bg-blue-100 text-blue-700',
  doc:  'bg-blue-100 text-blue-700',
  txt:  'bg-gray-100 text-gray-700',
  md:   'bg-purple-100 text-purple-700',
}

export function DocumentPreviewModal({ preview, onClose }: DocumentPreviewModalProps) {
  const [copied, setCopied] = React.useState(false)
  const overlayRef = useRef<HTMLDivElement>(null)

  // ESC 关闭
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  // 禁止背景滚动
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  // 点击遮罩关闭
  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) onClose()
  }

  // 复制全文
  const handleCopy = async () => {
    const full = preview.chunks.map((c) => c.content).join('\n\n')
    await navigator.clipboard.writeText(full)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
    >
      <div
        className="bg-white rounded-2xl shadow-2xl flex flex-col"
        style={{ width: 'min(760px, 100%)', maxHeight: '85vh' }}
      >
        {/* Header */}
        <div className="flex items-start gap-3 px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center flex-shrink-0">
            <FileText size={18} className="text-blue-500" />
          </div>
          <div className="flex-1 min-w-0">
            <h2
              className="font-semibold text-gray-800 truncate"
              title={preview.doc_name}
            >
              {preview.doc_name}
            </h2>
            <div className="flex items-center gap-2 mt-1">
              <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                DOC_TYPE_COLORS[preview.doc_type] || 'bg-gray-100 text-gray-600'
              }`}>
                {preview.doc_type.toUpperCase()}
              </span>
              <span className="flex items-center gap-1 text-xs text-gray-400">
                <Layers size={11} />
                {preview.chunk_count} 个文本块
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 text-gray-500
                hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              title="复制全文"
            >
              {copied
                ? <><Check size={13} className="text-green-500" /><span className="text-green-600">已复制</span></>
                : <><Copy size={13} /><span>复制全文</span></>
              }
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              title="关闭 (ESC)"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* 内容区 */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-0">
          {preview.chunks.map((chunk, idx) => (
            <div key={chunk.chunk_index}>
              {/* 块分隔线（首块不显示） */}
              {idx > 0 && (
                <div className="flex items-center gap-2 my-3">
                  <div className="flex-1 border-t border-dashed border-gray-200" />
                  <span className="text-[10px] text-gray-300 flex-shrink-0">
                    #{chunk.chunk_index + 1}
                  </span>
                  <div className="flex-1 border-t border-dashed border-gray-200" />
                </div>
              )}
              <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                {chunk.content}
              </p>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-100 flex justify-between items-center flex-shrink-0">
          <p className="text-xs text-gray-400">
            内容由文档分块后存储，虚线为块边界
          </p>
          <button
            onClick={onClose}
            className="text-xs px-3 py-1.5 bg-gray-100 hover:bg-gray-200
              text-gray-600 rounded-lg transition-colors"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  )
}
