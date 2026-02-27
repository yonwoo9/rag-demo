# 个人知识库助手

基于 **RAG + GLM + Milvus** 的智能文档问答系统。上传文档后，AI 会检索相关内容并生成精准回答，同时展示引用来源。

## 技术栈

| 层次 | 技术 |
|------|------|
| 前端 | TypeScript + React 18 + Vite + Tailwind CSS |
| 后端 | Python + FastAPI |
| 向量库 | Milvus（本地 Lite 或 Docker） |
| LLM | Zhipu AI GLM-4-Flash |
| Embedding | Zhipu AI embedding-2（1024 维） |

## 快速开始

### 1. 获取 API Key

前往 [智谱 AI 开放平台](https://open.bigmodel.cn/) 注册并获取 API Key。

### 2. 配置后端

```bash
cd backend
cp .env.example .env
# 编辑 .env，填入你的 ZHIPU_API_KEY
```

`.env` 关键配置：

```env
ZHIPU_API_KEY=your_api_key_here

# 本地模式（无需 Docker，推荐开发用）
MILVUS_URI=./milvus_data.db

# 远程 Milvus（Docker 部署后使用）
# MILVUS_URI=http://localhost:19530
```

### 3. 启动后端

```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
python run.py
```

后端运行于 `http://localhost:8000`，API 文档：`http://localhost:8000/docs`

### 4. 启动前端

```bash
cd frontend
npm install
npm run dev
```

前端运行于 `http://localhost:5173`

---

## Docker 部署（生产）

使用完整 Milvus 集群 + 容器化部署：

```bash
# 1. 配置环境变量
cp backend/.env.example backend/.env
# 编辑 backend/.env，设置 ZHIPU_API_KEY

# 2. 启动所有服务
docker-compose up -d

# 3. 访问
# 前端: http://localhost
# 后端 API: http://localhost:8000/docs
```

---

## 功能介绍

### 知识库管理
- 上传文档（PDF / DOCX / TXT / Markdown）
- 自动分块 → 向量化 → 存入 Milvus
- 查看文档列表（文件名、块数、上传时间）
- 删除文档

### 智能问答（RAG）
1. 用户提问 → 问题向量化
2. Milvus COSINE 相似度检索 Top-K 相关块
3. 将检索内容注入 System Prompt
4. GLM 生成答案（流式输出）
5. 展示引用来源及相关度分数

---

## 项目结构

```
rag-hero/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI 入口
│   │   ├── config.py            # 配置管理
│   │   ├── models.py            # Pydantic 模型
│   │   ├── routers/
│   │   │   ├── documents.py     # 文档上传/列表/删除
│   │   │   └── chat.py          # 流式/非流式问答
│   │   ├── services/
│   │   │   ├── milvus_service.py    # Milvus CRUD
│   │   │   ├── embedding_service.py # GLM Embedding
│   │   │   ├── document_service.py  # 文档解析
│   │   │   └── rag_service.py       # RAG 核心逻辑
│   │   └── utils/
│   │       └── text_splitter.py # 文本分块
│   ├── requirements.txt
│   └── run.py
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── ChatInterface.tsx  # 聊天界面
│   │   │   ├── DocumentUpload.tsx # 文件上传
│   │   │   ├── DocumentList.tsx   # 文档列表
│   │   │   └── MessageBubble.tsx  # 消息气泡
│   │   ├── services/api.ts        # API 调用
│   │   ├── types/index.ts         # TypeScript 类型
│   │   └── App.tsx
│   └── package.json
└── docker-compose.yml
```

## API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/documents/upload` | 上传文档 |
| GET  | `/api/documents/list` | 文档列表 |
| DELETE | `/api/documents/{doc_id}` | 删除文档 |
| POST | `/api/chat/stream` | 流式 RAG 问答（SSE） |
| POST | `/api/chat/` | 非流式 RAG 问答 |
| GET  | `/api/health` | 健康检查 |
