from typing import List
from zhipuai import ZhipuAI

from app.config import get_settings

settings = get_settings()
_client = None


def get_client() -> ZhipuAI:
    global _client
    if _client is None:
        _client = ZhipuAI(api_key=settings.zhipu_api_key)
    return _client


def get_embeddings(texts: List[str]) -> List[List[float]]:
    """批量获取文本向量，每次最多处理 25 条（API 限制）"""
    client = get_client()
    all_embeddings = []
    batch_size = 25

    for i in range(0, len(texts), batch_size):
        # 截断以满足模型的 token/长度限制
        batch = [t[:2000] for t in texts[i:i + batch_size]]
        if not batch:
            continue

        # 一次请求中发送多个 input，减少 API 调用次数
        response = client.embeddings.create(
            model=settings.embedding_model,
            input=batch,
        )
        # SDK 返回的 data 顺序与输入顺序一致
        for item in response.data:
            all_embeddings.append(item.embedding)

    return all_embeddings


def get_embedding(text: str) -> List[float]:
    """获取单个文本向量"""
    return get_embeddings([text])[0]
