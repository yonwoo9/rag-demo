from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


class DocumentInfo(BaseModel):
    doc_id: str
    doc_name: str
    doc_type: str
    chunk_count: int
    created_at: str


class ChatMessage(BaseModel):
    role: str  # "user" | "assistant"
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage]
    top_k: Optional[int] = 5
    stream: Optional[bool] = True
    doc_id: Optional[str] = None  # 指定文档 ID，None 表示全部文档


class ChatResponse(BaseModel):
    answer: str
    sources: list[dict] = Field(default_factory=list)


class UploadResponse(BaseModel):
    doc_id: str
    doc_name: str
    chunk_count: int
    message: str


class DeleteResponse(BaseModel):
    message: str
    doc_id: str


class DocumentChunk(BaseModel):
    chunk_index: int
    content: str


class DocumentPreviewResponse(BaseModel):
    doc_id: str
    doc_name: str
    doc_type: str
    chunk_count: int
    chunks: list[DocumentChunk]


