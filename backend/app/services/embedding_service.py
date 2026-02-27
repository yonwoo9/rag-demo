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
        batch = texts[i:i + batch_size]
        for text in batch:
            text = text[:2000]  # embedding-2 最大 token 限制
            response = client.embeddings.create(
                model=settings.embedding_model,
                input=text
            )
            all_embeddings.append(response.data[0].embedding)

    return all_embeddings


def get_embedding(text: str) -> List[float]:
    """获取单个文本向量"""
    return get_embeddings([text])[0]
