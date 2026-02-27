from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from app.models import ChatRequest, ChatResponse
from app.services.rag_service import rag_chat_stream, rag_chat
from app.services.milvus_service import list_documents

router = APIRouter(prefix="/chat", tags=["chat"])


def _resolve_doc_name(doc_id: str | None) -> str | None:
    """根据 doc_id 查询文档名，找不到返回 None"""
    if not doc_id:
        return None
    try:
        docs = list_documents()
        for doc in docs:
            if doc["doc_id"] == doc_id:
                return doc["doc_name"]
    except Exception:
        pass
    return None


@router.post("/stream")
async def chat_stream(request: ChatRequest):
    """流式 RAG 问答（SSE）"""
    if not request.messages:
        raise HTTPException(status_code=400, detail="消息不能为空")

    messages = [{"role": m.role, "content": m.content} for m in request.messages]
    top_k = request.top_k or 5
    doc_id = request.doc_id or None
    doc_name = _resolve_doc_name(doc_id)

    async def event_generator():
        try:
            async for chunk in rag_chat_stream(
                messages, top_k=top_k, doc_id=doc_id, doc_name=doc_name
            ):
                yield chunk
        except Exception as e:
            import json
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        }
    )


@router.post("/", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """非流式 RAG 问答"""
    if not request.messages:
        raise HTTPException(status_code=400, detail="消息不能为空")

    messages = [{"role": m.role, "content": m.content} for m in request.messages]
    top_k = request.top_k or 5
    doc_id = request.doc_id or None
    doc_name = _resolve_doc_name(doc_id)

    try:
        result = await rag_chat(
            messages, top_k=top_k, doc_id=doc_id, doc_name=doc_name
        )
        return ChatResponse(answer=result["answer"], sources=result["sources"])
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"问答失败: {str(e)}")
