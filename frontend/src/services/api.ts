import axios from 'axios'
import type { DocumentInfo, DocumentPreview, UploadResponse, StreamChunk, ChatMessage } from '../types'

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
})

// 文档管理
export const documentApi = {
  upload: async (file: File, onProgress?: (p: number) => void): Promise<UploadResponse> => {
    const formData = new FormData()
    formData.append('file', file)
    const { data } = await api.post<UploadResponse>('/documents/upload', formData, {
      onUploadProgress: (e) => {
        if (onProgress && e.total) {
          onProgress(Math.round((e.loaded * 100) / e.total))
        }
      },
    })
    return data
  },

  list: async (): Promise<DocumentInfo[]> => {
    const { data } = await api.get<DocumentInfo[]>('/documents/list')
    return data
  },

  delete: async (docId: string): Promise<void> => {
    await api.delete(`/documents/${docId}`)
  },

  preview: async (docId: string): Promise<DocumentPreview> => {
    const { data } = await api.get<DocumentPreview>(`/documents/${docId}/preview`)
    return data
  },
}

// 流式问答
export function streamChat(
  messages: ChatMessage[],
  topK: number = 5,
  docId: string | null = null,
  callbacks: {
    onSources: (sources: StreamChunk['sources']) => void
    onContent: (content: string) => void
    onDone: () => void
    onError: (msg: string) => void
  }
): () => void {
  const controller = new AbortController()

  const payload = {
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
    top_k: topK,
    stream: true,
    doc_id: docId ?? null,
  }

  fetch('/api/chat/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: controller.signal,
  })
    .then(async (response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      if (!response.body) throw new Error('无响应体')

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const jsonStr = line.slice(6).trim()
          if (!jsonStr) continue
          try {
            const chunk: StreamChunk = JSON.parse(jsonStr)
            if (chunk.type === 'sources') callbacks.onSources(chunk.sources)
            else if (chunk.type === 'content') callbacks.onContent(chunk.content || '')
            else if (chunk.type === 'done') callbacks.onDone()
            else if (chunk.type === 'error') callbacks.onError(chunk.message || '未知错误')
          } catch {
            // 忽略解析错误
          }
        }
      }
    })
    .catch((err) => {
      if (err.name !== 'AbortError') {
        callbacks.onError(err.message || '网络错误')
      }
    })

  return () => controller.abort()
}
