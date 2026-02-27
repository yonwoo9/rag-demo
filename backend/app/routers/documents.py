from fastapi import APIRouter, UploadFile, File, HTTPException
from pathlib import Path
import os
import logging

from app.config import get_settings
from app.models import UploadResponse, DeleteResponse, DocumentInfo, DocumentChunk, DocumentPreviewResponse
from app.services.document_service import parse_document, generate_doc_id, save_upload_file
from app.services.embedding_service import get_embeddings
from app.services.milvus_service import insert_chunks, list_documents, delete_document, document_exists, get_document_chunks

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/documents", tags=["documents"])
settings = get_settings()

ALLOWED_EXTENSIONS = {".pdf", ".docx", ".doc", ".txt", ".md"}


@router.post("/upload", response_model=UploadResponse)
async def upload_document(file: UploadFile = File(...)):
    """上传并处理文档：解析 → 分块 → 向量化 → 存入 Milvus"""
    filename = file.filename or ""
    ext = Path(filename).suffix.lower()

    if not filename:
        raise HTTPException(status_code=400, detail="文件名不能为空")

    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"不支持的文件类型 {ext}，支持：{', '.join(ALLOWED_EXTENSIONS)}"
        )

    content = await file.read()
    if len(content) > settings.max_file_size:
        raise HTTPException(status_code=413, detail="文件过大，最大支持 20MB")

    file_path: str | None = None
    try:
        file_path = await save_upload_file(content, filename)

        # 解析文档 → 分块
        chunks = await parse_document(file_path, filename)

        # 生成文档 ID
        doc_id = generate_doc_id(filename)

        # 批量向量化
        embeddings = get_embeddings(chunks)

        # 存入 Milvus
        doc_type = ext.lstrip(".")
        count = insert_chunks(
            doc_id=doc_id,
            doc_name=filename,
            doc_type=doc_type,
            chunks=chunks,
            embeddings=embeddings
        )

        return UploadResponse(
            doc_id=doc_id,
            doc_name=filename,
            chunk_count=count,
            message=f"文档上传成功，共生成 {count} 个知识块"
        )

    except HTTPException:
        raise

    except ValueError as e:
        # 文档解析/分块失败（业务错误）
        logger.warning("文档解析失败 [%s]: %s", filename, e)
        raise HTTPException(status_code=400, detail=str(e))

    except Exception as e:
        # API 调用失败、网络错误等（服务端错误）
        logger.error("处理文档异常 [%s]: %s: %s", filename, type(e).__name__, e)
        raise HTTPException(status_code=500, detail=f"处理文档失败: {e}")

    finally:
        if file_path and os.path.exists(file_path):
            os.remove(file_path)


@router.get("/list", response_model=list[DocumentInfo])
async def get_documents():
    """获取知识库中所有文档列表"""
    try:
        docs = list_documents()
        return [DocumentInfo(**doc) for doc in docs]
    except Exception as e:
        logger.error("获取文档列表失败: %s", e)
        raise HTTPException(status_code=500, detail=f"获取文档列表失败: {str(e)}")


@router.delete("/{doc_id}", response_model=DeleteResponse)
async def remove_document(doc_id: str):
    """从知识库删除指定文档"""
    try:
        if not document_exists(doc_id):
            raise HTTPException(status_code=404, detail="文档不存在")
        delete_document(doc_id)
        return DeleteResponse(message="文档已删除", doc_id=doc_id)
    except HTTPException:
        raise
    except Exception as e:
        logger.error("删除文档失败 [%s]: %s", doc_id, e)
        raise HTTPException(status_code=500, detail=f"删除文档失败: {str(e)}")


@router.get("/{doc_id}/preview", response_model=DocumentPreviewResponse)
async def preview_document(doc_id: str):
    """获取文档所有文本块用于预览"""
    try:
        if not document_exists(doc_id):
            raise HTTPException(status_code=404, detail="文档不存在")
        chunks = get_document_chunks(doc_id)
        if not chunks:
            raise HTTPException(status_code=404, detail="文档内容为空")
        return DocumentPreviewResponse(
            doc_id=doc_id,
            doc_name=chunks[0]["doc_name"],
            doc_type=chunks[0].get("doc_type", ""),
            chunk_count=len(chunks),
            chunks=[
                DocumentChunk(chunk_index=c["chunk_index"], content=c["content"])
                for c in chunks
            ]
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error("获取文档预览失败 [%s]: %s", doc_id, e)
        raise HTTPException(status_code=500, detail=f"获取预览失败: {str(e)}")
