import React, { useRef, useState } from 'react'
import { Upload, FileText, X, CheckCircle, AlertCircle, Loader2 } from 'lucide-react'
import { documentApi } from '../services/api'

interface UploadFile {
  id: string
  file: File
  status: 'pending' | 'uploading' | 'success' | 'error'
  progress: number
  message: string
  chunkCount?: number
}

interface DocumentUploadProps {
  onUploadSuccess: () => void
}

const ACCEPTED = '.pdf,.docx,.doc,.txt,.md'
const FILE_ICONS: Record<string, string> = {
  pdf: '📄',
  docx: '📝',
  doc: '📝',
  txt: '📃',
  md: '📋',
}

export function DocumentUpload({ onUploadSuccess }: DocumentUploadProps) {
  const [files, setFiles] = useState<UploadFile[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const addFiles = (newFiles: File[]) => {
    const items: UploadFile[] = newFiles.map((f) => ({
      id: Math.random().toString(36).slice(2),
      file: f,
      status: 'pending',
      progress: 0,
      message: '',
    }))
    setFiles((prev) => [...prev, ...items])
    items.forEach((item) => uploadFile(item))
  }

  const uploadFile = async (item: UploadFile) => {
    setFiles((prev) =>
      prev.map((f) => (f.id === item.id ? { ...f, status: 'uploading' } : f))
    )
    try {
      const result = await documentApi.upload(item.file, (progress) => {
        setFiles((prev) =>
          prev.map((f) => (f.id === item.id ? { ...f, progress } : f))
        )
      })
      setFiles((prev) =>
        prev.map((f) =>
          f.id === item.id
            ? {
                ...f,
                status: 'success',
                progress: 100,
                message: `成功生成 ${result.chunk_count} 个知识块`,
                chunkCount: result.chunk_count,
              }
            : f
        )
      )
      onUploadSuccess()
    } catch (err: unknown) {
      const msg = err instanceof Error
        ? err.message
        : (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || '上传失败'
      setFiles((prev) =>
        prev.map((f) =>
          f.id === item.id ? { ...f, status: 'error', message: msg } : f
        )
      )
    }
  }

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id))
  }

  const getFileIcon = (filename: string) => {
    const ext = filename.split('.').pop()?.toLowerCase() || ''
    return FILE_ICONS[ext] || '📄'
  }

  return (
    <div className="space-y-3">
      {/* 拖拽上传区 */}
      <div
        className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors
          ${isDragging
            ? 'border-blue-400 bg-blue-50'
            : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'
          }`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setIsDragging(false)
          const dropped = Array.from(e.dataTransfer.files)
          if (dropped.length) addFiles(dropped)
        }}
      >
        <Upload className="mx-auto mb-2 text-gray-400" size={28} />
        <p className="text-sm font-medium text-gray-600">
          点击或拖拽文件上传
        </p>
        <p className="text-xs text-gray-400 mt-1">
          支持 PDF、Word、TXT、Markdown，最大 20MB
        </p>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept={ACCEPTED}
          multiple
          onChange={(e) => {
            const selected = Array.from(e.target.files || [])
            if (selected.length) addFiles(selected)
            e.target.value = ''
          }}
        />
      </div>

      {/* 文件列表 */}
      {files.length > 0 && (
        <div className="space-y-2">
          {files.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-3 p-3 bg-white border border-gray-100 rounded-lg text-sm"
            >
              <span className="text-lg flex-shrink-0">{getFileIcon(item.file.name)}</span>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-700 truncate">{item.file.name}</p>
                <p className={`text-xs mt-0.5 ${
                  item.status === 'error' ? 'text-red-500' :
                  item.status === 'success' ? 'text-green-600' : 'text-gray-400'
                }`}>
                  {item.status === 'uploading'
                    ? `处理中 ${item.progress}%`
                    : item.message || (item.status === 'pending' ? '等待上传...' : '')}
                </p>
                {item.status === 'uploading' && (
                  <div className="mt-1 h-1 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-400 transition-all duration-300"
                      style={{ width: `${item.progress}%` }}
                    />
                  </div>
                )}
              </div>
              <div className="flex-shrink-0">
                {item.status === 'uploading' && (
                  <Loader2 size={16} className="text-blue-500 animate-spin" />
                )}
                {item.status === 'success' && (
                  <CheckCircle size={16} className="text-green-500" />
                )}
                {item.status === 'error' && (
                  <AlertCircle size={16} className="text-red-500" />
                )}
                {item.status !== 'uploading' && (
                  <button
                    onClick={() => removeFile(item.id)}
                    className="ml-1 text-gray-300 hover:text-gray-500 transition-colors"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
