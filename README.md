# 个人知识库助手

基于 **RAG + GLM + Milvus** 的智能文档问答系统。上传文档后，AI 检索相关内容并流式生成精准回答，同时展示引用来源与相关度分数。

## 技术栈

| 层次 | 技术 |
|------|------|
| 前端 | TypeScript + React 18 + Vite + Tailwind CSS |
| 后端 | Python 3.11+ + FastAPI + asyncio |
| 向量库 | Milvus Lite（本地）/ Milvus Standalone（Docker） |
| LLM | Zhipu AI GLM-4.7 |
| Embedding | Zhipu AI embedding-3（2048 维） |

---

## 功能一览

### 知识库管理
- 拖拽或点击上传文档（PDF / DOCX / TXT / Markdown），最大 20MB
- 自动解析 → 递归分块 → 向量化 → 存入 Milvus
- 文档列表展示（文件名、类型、块数、上传时间）
- **文档内容预览**：弹窗查看所有文本块，支持一键复制全文
- 删除文档（同步清除 Milvus 中的所有向量）

### 智能问答（RAG）
- **全库检索**（默认）或**单文档检索**：输入框上方可选择检索范围
- 切换检索范围时自动隔离对话上下文，避免旧历史干扰
- 真正的**流式输出**：GLM 每个 token 实时推送，asyncio 线程池桥接
- 展示检索来源文档及相关度分数，支持展开/折叠

### RAG 流程

```
用户提问
  ↓
embedding-3 向量化（asyncio.to_thread 非阻塞）
  ↓
Milvus COSINE 相似度检索 Top-K（可按 doc_id 过滤）
  ↓
构建 System Prompt（注入检索内容 + 检索范围说明）
  ↓
GLM-4.7 流式生成（线程池 + asyncio.Queue 桥接 → SSE 推流）
  ↓
前端逐 token 渲染 Markdown + 展示引用来源
```

---

## 快速开始

### 1. 获取 API Key

前往 [智谱 AI 开放平台](https://open.bigmodel.cn/) 注册并获取 API Key。

### 2. 配置后端

```bash
cd backend
cp .env.example .env
# 编辑 .env，填入 ZHIPU_API_KEY
```

`.env` 关键配置：

```env
ZHIPU_API_KEY=your_api_key_here

# 本地模式（无需 Docker，推荐开发）
MILVUS_URI=./milvus_data.db

# 远程 Milvus（Docker 部署后使用）
# MILVUS_URI=http://localhost:19530

EMBEDDING_MODEL=embedding-3
CHAT_MODEL=glm-4.7
CHUNK_SIZE=500
CHUNK_OVERLAP=50
TOP_K=5
```

### 3. 启动后端

```bash
cd backend
python -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
python run.py
# → http://localhost:8000
# → API 文档: http://localhost:8000/docs
```

> **切换 embedding 模型后**（如从 embedding-2 改为 embedding-3），需删除旧数据库文件并重启，服务会自动重建 Collection：
> ```bash
> rm -f milvus_data.db && python run.py
> ```

### 4. 启动前端

```bash
cd frontend
npm install
npm run dev
# → http://localhost:5173
```

---

## Docker 部署（生产）

```bash
# 1. 配置环境变量
cp backend/.env.example backend/.env
# 编辑 backend/.env，设置 ZHIPU_API_KEY 并将 MILVUS_URI 改为 http://milvus:19530

# 2. 启动全部服务（Milvus + 后端 + 前端）
docker-compose up -d

# 访问地址
# 前端:     http://localhost
# 后端 API: http://localhost:8000/docs
```

---

## 项目结构

```
rag-hero/
├── backend/
│   ├── app/
│   │   ├── main.py                  # FastAPI 入口，启动时初始化 Milvus Collection
│   │   ├── config.py                # 统一配置（pydantic-settings，读取 .env）
│   │   ├── models.py                # Pydantic 请求/响应模型
│   │   ├── routers/
│   │   │   ├── documents.py         # 上传 / 列表 / 删除 / 预览
│   │   │   └── chat.py              # 流式 / 非流式 RAG 问答
│   │   ├── services/
│   │   │   ├── milvus_service.py    # Milvus CRUD（支持 doc_id 过滤）
│   │   │   ├── embedding_service.py # GLM embedding 调用
│   │   │   ├── document_service.py  # PDF / DOCX / TXT / MD 解析
│   │   │   └── rag_service.py       # RAG 核心：异步检索 + GLM 流式桥接
│   │   └── utils/
│   │       └── text_splitter.py     # 递归字符分块（含重叠）
│   ├── requirements.txt
│   ├── .env.example
│   ├── Dockerfile
│   └── run.py
├── frontend/
│   └── src/
│       ├── components/
│       │   ├── ChatInterface.tsx        # 聊天主界面（SSE 流式 + 文档选择器）
│       │   ├── DocumentUpload.tsx       # 拖拽上传 + 进度条
│       │   ├── DocumentList.tsx         # 文档列表（预览 + 删除）
│       │   ├── DocumentPreviewModal.tsx # 文档内容预览弹窗
│       │   └── MessageBubble.tsx        # 消息气泡（Markdown + 来源 + 系统消息）
│       ├── services/api.ts              # Axios + fetch SSE 封装
│       ├── types/index.ts               # TypeScript 类型定义
│       └── App.tsx
├── docker-compose.yml
├── .gitignore
└── README.md
```

---

## API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/documents/upload` | 上传并处理文档 |
| `GET` | `/api/documents/list` | 获取文档列表 |
| `DELETE` | `/api/documents/{doc_id}` | 删除文档 |
| `GET` | `/api/documents/{doc_id}/preview` | 获取文档文本块预览 |
| `POST` | `/api/chat/stream` | 流式 RAG 问答（SSE） |
| `POST` | `/api/chat/` | 非流式 RAG 问答 |
| `GET` | `/api/health` | 服务健康检查 |

### 流式问答请求示例

```bash
curl -X POST http://localhost:8000/api/chat/stream \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [{"role": "user", "content": "文档的主要内容是什么？"}],
    "top_k": 5,
    "doc_id": null
  }'
```

`doc_id` 传 `null` 检索全部文档，传具体 ID 则只在该文档内检索。

---

## 注意事项

- **API Key 安全**：`.env` 已加入 `.gitignore`，请勿将真实 Key 提交到仓库
- **模型切换**：更换 `EMBEDDING_MODEL` 后需删除 `milvus_data.db` 重建索引（维度变化导致不兼容）
- **gRPC 日志**：milvus-lite 会输出 keepalive 相关日志，已通过 `GRPC_VERBOSITY=error` 屏蔽，不影响功能
