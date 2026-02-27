import React, { useState } from 'react'
import { Brain, BookOpen, MessageSquare, ChevronLeft, ChevronRight } from 'lucide-react'
import { ChatInterface } from './components/ChatInterface'
import { DocumentUpload } from './components/DocumentUpload'
import { DocumentList } from './components/DocumentList'
import './index.css'

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [activeTab, setActiveTab] = useState<'upload' | 'docs'>('docs')
  const [refreshTrigger, setRefreshTrigger] = useState(0)

  const handleUploadSuccess = () => {
    setRefreshTrigger((n) => n + 1)
    setActiveTab('docs')
  }

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* 侧边栏 */}
      <aside
        className={`flex flex-col bg-white border-r border-gray-100 transition-all duration-300 flex-shrink-0
          ${sidebarOpen ? 'w-80' : 'w-0'} overflow-hidden`}
      >
        {/* 侧边栏 Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
          <div className="w-8 h-8 bg-blue-500 rounded-xl flex items-center justify-center">
            <Brain size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-base font-bold text-gray-800">知识库助手</h1>
            <p className="text-xs text-gray-400">RAG · GLM · Milvus</p>
          </div>
        </div>

        {/* Tab 切换 */}
        <div className="flex p-3 gap-1 border-b border-gray-100">
          <button
            onClick={() => setActiveTab('docs')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm transition-colors
              ${activeTab === 'docs'
                ? 'bg-blue-50 text-blue-600 font-medium'
                : 'text-gray-500 hover:bg-gray-50'
              }`}
          >
            <BookOpen size={14} />
            知识库
          </button>
          <button
            onClick={() => setActiveTab('upload')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm transition-colors
              ${activeTab === 'upload'
                ? 'bg-blue-50 text-blue-600 font-medium'
                : 'text-gray-500 hover:bg-gray-50'
              }`}
          >
            <MessageSquare size={14} />
            上传
          </button>
        </div>

        {/* Tab 内容 */}
        <div className="flex-1 overflow-y-auto p-4">
          {activeTab === 'upload' ? (
            <DocumentUpload onUploadSuccess={handleUploadSuccess} />
          ) : (
            <DocumentList refreshTrigger={refreshTrigger} />
          )}
        </div>

        {/* 底部信息 */}
        <div className="px-4 py-3 border-t border-gray-100 text-xs text-gray-400">
          <p>支持 PDF / DOCX / TXT / MD</p>
        </div>
      </aside>

      {/* 主区域 */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* 折叠按钮 */}
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="absolute left-0 top-1/2 -translate-y-1/2 z-10 bg-white border border-gray-200
            rounded-r-lg p-1.5 shadow-sm hover:bg-gray-50 transition-colors"
          style={{ left: sidebarOpen ? '320px' : '0px', transition: 'left 0.3s' }}
        >
          {sidebarOpen ? <ChevronLeft size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />}
        </button>

        <ChatInterface />
      </main>
    </div>
  )
}
