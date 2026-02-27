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
    """RAG 流式问答"""
    client = ZhipuAI(api_key=settings.zhipu_api_key)

    user_question = ""
    for msg in reversed(messages):
        if msg["role"] == "user":
            user_question = msg["content"]
            break

    search_results = []
    sources = []
    if user_question:
        query_embedding = get_embedding(user_question)
        search_results = search_similar(query_embedding, top_k=top_k, doc_id=doc_id)
        search_results = [r for r in search_results if r["score"] > 0.3]
        sources = [
            {"doc_name": r["doc_name"], "content": r["content"][:200], "score": round(r["score"], 4)}
            for r in search_results
        ]

    context = _build_context(search_results)
    system_prompt = _build_system_prompt(context, doc_name)

    history = [
        {"role": msg["role"], "content": msg["content"]}
        for msg in messages[-10:]
    ]

    yield f"data: {json.dumps({'type': 'sources', 'sources': sources})}\n\n"

    response = client.chat.completions.create(
        model=settings.chat_model,
        messages=[{"role": "system", "content": system_prompt}] + history,
        stream=True,
        temperature=0.7,
        max_tokens=2048
    )

    for chunk in response:
        if chunk.choices and chunk.choices[0].delta.content:
            content = chunk.choices[0].delta.content
            yield f"data: {json.dumps({'type': 'content', 'content': content})}\n\n"

    yield f"data: {json.dumps({'type': 'done'})}\n\n"


async def rag_chat(
    messages: List[dict],
    top_k: int = 5,
    doc_id: Optional[str] = None,
    doc_name: Optional[str] = None
) -> dict:
    """RAG 非流式问答"""
    client = ZhipuAI(api_key=settings.zhipu_api_key)

    user_question = ""
    for msg in reversed(messages):
        if msg["role"] == "user":
            user_question = msg["content"]
            break

    search_results = []
    if user_question:
        query_embedding = get_embedding(user_question)
        search_results = search_similar(query_embedding, top_k=top_k, doc_id=doc_id)
        search_results = [r for r in search_results if r["score"] > 0.3]

    context = _build_context(search_results)
    system_prompt = _build_system_prompt(context, doc_name)

    history = [
        {"role": msg["role"], "content": msg["content"]}
        for msg in messages[-10:]
    ]

    response = client.chat.completions.create(
        model=settings.chat_model,
        messages=[{"role": "system", "content": system_prompt}] + history,
        temperature=0.7,
        max_tokens=2048
    )

    sources = [
        {"doc_name": r["doc_name"], "content": r["content"][:200], "score": round(r["score"], 4)}
        for r in search_results
    ]

    return {
        "answer": response.choices[0].message.content,
        "sources": sources
    }
