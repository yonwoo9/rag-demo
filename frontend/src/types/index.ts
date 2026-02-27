export interface DocumentInfo {
  doc_id: string
  doc_name: string
  doc_type: string
  chunk_count: number
  created_at: string
}

export interface DocumentChunk {
  chunk_index: number
  content: string
}

export interface DocumentPreview {
  doc_id: string
  doc_name: string
  doc_type: string
  chunk_count: number
  chunks: DocumentChunk[]
}

export interface UploadResponse {
  doc_id: string
  doc_name: string
  chunk_count: number
  message: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  sources?: Source[]
  isStreaming?: boolean
  error?: string
}

export interface Source {
  doc_name: string
  content: string
  score: number
}

export interface StreamChunk {
  type: 'sources' | 'content' | 'done' | 'error'
  content?: string
  sources?: Source[]
  message?: string
}
