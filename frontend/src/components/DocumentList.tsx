import React, { useEffect, useState } from 'react'
import { Trash2, RefreshCw, FileText, Layers, Clock, Eye } from 'lucide-react'
import { documentApi } from '../services/api'
import { DocumentPreviewModal } from './DocumentPreviewModal'
import type { DocumentInfo, DocumentPreview } from '../types'

interface DocumentListProps {
  refreshTrigger: number
}

const DOC_TYPE_COLORS: Record<string, string> = {
  pdf:  'bg-red-100 text-red-700',
  docx: 'bg-blue-100 text-blue-700',
  doc:  'bg-blue-100 text-blue-700',
  txt:  'bg-gray-100 text-gray-700',
  md:   'bg-purple-100 text-purple-700',
}

export function DocumentList({ refreshTrigger }: DocumentListProps) {
  const [docs, setDocs] = useState<DocumentInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [previewing, setPreviewing] = useState<string | null>(null)
  const [previewData, setPreviewData] = useState<DocumentPreview | null>(null)

  const loadDocs = async () => {
    setLoading(true)
    try {
      const list = await documentApi.list()
      setDocs(list)
    } catch {
      console.error('加载文档列表失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadDocs()
  }, [refreshTrigger])

  const handleDelete = async (docId: string, docName: string) => {
    if (!confirm(`确定要删除《${docName}》吗？此操作不可恢复。`)) return
    setDeleting(docId)
    try {
      await documentApi.delete(docId)
      setDocs((prev) => prev.filter((d) => d.doc_id !== docId))
    } catch {
      alert('删除失败，请重试')
    } finally {
      setDeleting(null)
    }
  }

  const handlePreview = async (docId: string) => {
    setPreviewing(docId)
    try {
      const data = await documentApi.preview(docId)
      setPreviewData(data)
    } catch {
      alert('加载预览失败，请重试')
    } finally {
      setPreviewing(null)
    }
  }

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleString('zh-CN', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    } catch {
      return dateStr
    }
  }

  return (
    <>
      <div>
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm text-gray-500">共 {docs.length} 个文档</span>
          <button
            onClick={loadDocs}
            disabled={loading}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            title="刷新"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        {loading && docs.length === 0 ? (
          <div className="text-center py-8 text-gray-400 text-sm">
            <RefreshCw size={20} className="animate-spin mx-auto mb-2" />
            加载中...
          </div>
        ) : docs.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <FileText size={32} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm">知识库为空</p>
            <p className="text-xs mt-1">上传文档开始构建知识库</p>
          </div>
        ) : (
          <div className="space-y-2">
            {docs.map((doc) => (
              <div
                key={doc.doc_id}
                className="group flex items-start gap-3 p-3 bg-white border border-gray-100
                  rounded-lg hover:border-gray-200 hover:shadow-sm transition-all"
              >
                <FileText size={16} className="text-gray-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p
                    className="text-sm font-medium text-gray-700 truncate"
                    title={doc.doc_name}
                  >
                    {doc.doc_name}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                      DOC_TYPE_COLORS[doc.doc_type] || 'bg-gray-100 text-gray-600'
                    }`}>
                      {doc.doc_type.toUpperCase()}
                    </span>
                    <span className="flex items-center gap-0.5 text-xs text-gray-400">
                      <Layers size={10} />
                      {doc.chunk_count} 块
                    </span>
                    <span className="flex items-center gap-0.5 text-xs text-gray-400">
                      <Clock size={10} />
                      {formatDate(doc.created_at)}
                    </span>
                  </div>
                </div>

                {/* 操作按钮：hover 时显示 */}
                <div className="flex items-center gap-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  {/* 预览按钮 */}
                  <button
                    onClick={() => handlePreview(doc.doc_id)}
                    disabled={previewing === doc.doc_id}
                    className="p-1.5 text-gray-300 hover:text-blue-500 hover:bg-blue-50
                      rounded transition-colors"
                    title="预览内容"
                  >
                    {previewing === doc.doc_id
                      ? <RefreshCw size={13} className="animate-spin text-blue-400" />
                      : <Eye size={13} />
                    }
                  </button>

                  {/* 删除按钮 */}
                  <button
                    onClick={() => handleDelete(doc.doc_id, doc.doc_name)}
                    disabled={deleting === doc.doc_id}
                    className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50
                      rounded transition-colors"
                    title="删除"
                  >
                    {deleting === doc.doc_id
                      ? <RefreshCw size={13} className="animate-spin" />
                      : <Trash2 size={13} />
                    }
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 预览 Modal */}
      {previewData && (
        <DocumentPreviewModal
          preview={previewData}
          onClose={() => setPreviewData(null)}
        />
      )}
    </>
  )
}
