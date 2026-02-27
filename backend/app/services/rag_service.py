import asyncio
import json
from typing import List, AsyncGenerator, Optional
from zhipuai import ZhipuAI

from app.config import get_settings
from app.services.embedding_service import get_embedding
from app.services.milvus_service import search_similar

settings = get_settings()


def _build_context(search_results: List[dict]) -> str:
    if not search_results:
        return ""
    parts = []
    for i, result in enumerate(search_results, 1):
        parts.append(
            f"[来源{i}] 文档：《{result['doc_name']}》\n{result['content']}"
        )
    return "\n\n---\n\n".join(parts)


def _build_system_prompt(context: str, doc_name: Optional[str] = None) -> str:
    scope = f"文档《{doc_name}》" if doc_name else "知识库"
    if context:
        return f"""你是一个专业的知识库助手。请基于以下从{scope}中检索到的相关内容回答用户问题。

## 参考文档
{context}

## 回答要求
- 优先基于提供的文档内容作答，必要时可补充你的知识
- 如果文档中没有相关信息，明确告知用户
- 回答要准确、简洁，适当引用文档来源
- 使用中文回答"""
    else:
        return f"你是一个专业的知识库助手，请回答用户的问题。当前检索范围为{scope}，如果其中没有相关内容，请直接说明。"


async def rag_chat_stream(
    messages: List[dict],
    top_k: int = 5,
    doc_id: Optional[str] = None,
    doc_name: Optional[str] = None
) -> AsyncGenerator[str, None]:
    """RAG 流式问答：embedding/检索在线程池运行，GLM 流式通过队列桥接"""
    client = ZhipuAI(api_key=settings.zhipu_api_key)

    user_question = ""
    for msg in reversed(messages):
        if msg["role"] == "user":
            user_question = msg["content"]
            break

    # ① 异步执行阻塞的 embedding + 向量检索
    search_results: List[dict] = []
    sources: List[dict] = []
    if user_question:
        query_embedding = await asyncio.to_thread(get_embedding, user_question)
        raw = await asyncio.to_thread(search_similar, query_embedding, top_k, doc_id)
        search_results = [r for r in raw if r["score"] > 0.3]
        sources = [
            {
                "doc_name": r["doc_name"],
                "content": r["content"][:200],
                "score": round(r["score"], 4),
            }
            for r in search_results
        ]

    context = _build_context(search_results)
    system_prompt = _build_system_prompt(context, doc_name)
    history = [
        {"role": m["role"], "content": m["content"]}
        for m in messages[-10:]
    ]

    # ② 先推送 sources
    yield f"data: {json.dumps({'type': 'sources', 'sources': sources}, ensure_ascii=False)}\n\n"

    # ③ 同步 GLM 流式迭代 → 线程池 + asyncio.Queue → 异步 yield
    loop = asyncio.get_running_loop()
    queue: asyncio.Queue = asyncio.Queue()

    def _glm_stream_worker() -> None:
        """在线程池中运行同步 GLM 流式调用，把每个 token 放入队列"""
        try:
            response = client.chat.completions.create(
                model=settings.chat_model,
                messages=[{"role": "system", "content": system_prompt}] + history,
                stream=True,
                temperature=0.7,
                max_tokens=2048,
            )
            for chunk in response:
                delta = chunk.choices[0].delta if chunk.choices else None
                if delta and delta.content:
                    loop.call_soon_threadsafe(queue.put_nowait, delta.content)
        except Exception as exc:
            loop.call_soon_threadsafe(queue.put_nowait, exc)
        finally:
            loop.call_soon_threadsafe(queue.put_nowait, None)  # 结束哨兵

    loop.run_in_executor(None, _glm_stream_worker)

    # 逐 token yield 给 FastAPI StreamingResponse
    while True:
        item = await queue.get()
        if item is None:
            break
        if isinstance(item, Exception):
            raise item
        yield f"data: {json.dumps({'type': 'content', 'content': item}, ensure_ascii=False)}\n\n"

    yield f"data: {json.dumps({'type': 'done'})}\n\n"


async def rag_chat(
    messages: List[dict],
    top_k: int = 5,
    doc_id: Optional[str] = None,
    doc_name: Optional[str] = None
) -> dict:
    """RAG 非流式问答（用于 /api/chat/ 接口）"""
    client = ZhipuAI(api_key=settings.zhipu_api_key)

    user_question = ""
    for msg in reversed(messages):
        if msg["role"] == "user":
            user_question = msg["content"]
            break

    search_results: List[dict] = []
    if user_question:
        query_embedding = await asyncio.to_thread(get_embedding, user_question)
        raw = await asyncio.to_thread(search_similar, query_embedding, top_k, doc_id)
        search_results = [r for r in raw if r["score"] > 0.3]

    context = _build_context(search_results)
    system_prompt = _build_system_prompt(context, doc_name)
    history = [
        {"role": m["role"], "content": m["content"]}
        for m in messages[-10:]
    ]

    response = await asyncio.to_thread(
        lambda: client.chat.completions.create(
            model=settings.chat_model,
            messages=[{"role": "system", "content": system_prompt}] + history,
            temperature=0.7,
            max_tokens=2048,
        )
    )

    sources = [
        {
            "doc_name": r["doc_name"],
            "content": r["content"][:200],
            "score": round(r["score"], 4),
        }
        for r in search_results
    ]
    return {"answer": response.choices[0].message.content, "sources": sources}
