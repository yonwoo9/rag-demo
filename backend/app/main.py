from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import logging

from app.routers import documents, chat
from app.services.milvus_service import init_collection

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s][%(name)s]: %(message)s"
)

app = FastAPI(
    title="个人知识库助手 API",
    description="基于 RAG + GLM + Milvus 的智能问答系统",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(documents.router, prefix="/api")
app.include_router(chat.router, prefix="/api")


@app.on_event("startup")
async def startup_event():
    """服务启动时初始化 Milvus Collection"""
    init_collection()
    print("✅ Milvus Collection 初始化完成")


@app.get("/api/health")
async def health_check():
    return {"status": "ok", "message": "知识库助手服务运行中"}
