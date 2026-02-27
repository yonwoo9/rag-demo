from typing import List, Dict, Any, Optional
from pymilvus import MilvusClient, DataType
from datetime import datetime

from app.config import get_settings

settings = get_settings()
_client: Optional[MilvusClient] = None


def get_milvus_client() -> MilvusClient:
    global _client
    if _client is None:
        _client = MilvusClient(uri=settings.milvus_uri)
    return _client


def _get_existing_dim(client: MilvusClient) -> int | None:
    """获取已有 collection 的向量维度，不存在则返回 None"""
    try:
        desc = client.describe_collection(settings.collection_name)
        for field in desc.get("fields", []):
            if field.get("name") == "embedding":
                return field.get("params", {}).get("dim")
    except Exception:
        pass
    return None


def init_collection():
    """初始化 Milvus Collection（表结构）；若维度不匹配则自动重建"""
    import logging
    logger = logging.getLogger(__name__)
    client = get_milvus_client()

    if client.has_collection(settings.collection_name):
        existing_dim = _get_existing_dim(client)
        if existing_dim == settings.embedding_dim:
            return  # 维度一致，直接复用
        # 维度不一致（切换了 embedding 模型），删除旧 collection 重建
        logger.warning(
            "Collection 向量维度 %s 与配置 %s 不符，删除旧数据并重建",
            existing_dim, settings.embedding_dim
        )
        client.drop_collection(settings.collection_name)

    schema = MilvusClient.create_schema(auto_id=True, enable_dynamic_field=False)
    schema.add_field("id", DataType.INT64, is_primary=True)
    schema.add_field("doc_id", DataType.VARCHAR, max_length=64)
    schema.add_field("doc_name", DataType.VARCHAR, max_length=512)
    schema.add_field("doc_type", DataType.VARCHAR, max_length=32)
    schema.add_field("content", DataType.VARCHAR, max_length=4096)
    schema.add_field("chunk_index", DataType.INT64)
    schema.add_field("created_at", DataType.VARCHAR, max_length=32)
    schema.add_field("embedding", DataType.FLOAT_VECTOR, dim=settings.embedding_dim)

    index_params = MilvusClient.prepare_index_params()
    index_params.add_index(
        field_name="embedding",
        index_type="AUTOINDEX",
        metric_type="COSINE",
    )

    client.create_collection(
        collection_name=settings.collection_name,
        schema=schema,
        index_params=index_params
    )


def insert_chunks(
    doc_id: str,
    doc_name: str,
    doc_type: str,
    chunks: List[str],
    embeddings: List[List[float]]
) -> int:
    """插入文档块及其向量"""
    client = get_milvus_client()
    now = datetime.now().isoformat()

    data = [
        {
            "doc_id": doc_id,
            "doc_name": doc_name,
            "doc_type": doc_type,
            "content": chunk[:4000],
            "chunk_index": i,
            "created_at": now,
            "embedding": embedding
        }
        for i, (chunk, embedding) in enumerate(zip(chunks, embeddings))
    ]

    result = client.insert(collection_name=settings.collection_name, data=data)
    return result["insert_count"]


def search_similar(
    query_embedding: List[float],
    top_k: int = 5,
    doc_id: Optional[str] = None
) -> List[Dict[str, Any]]:
    """向量相似性搜索，doc_id 不为 None 时只在该文档内检索"""
    client = get_milvus_client()

    search_kwargs: Dict[str, Any] = {
        "collection_name": settings.collection_name,
        "data": [query_embedding],
        "limit": top_k,
        "output_fields": ["doc_id", "doc_name", "content", "chunk_index"],
        "search_params": {"metric_type": "COSINE", "params": {}}
    }
    if doc_id:
        search_kwargs["filter"] = f'doc_id == "{doc_id}"'

    results = client.search(**search_kwargs)

    hits = []
    for hit in results[0]:
        hits.append({
            "doc_id": hit["entity"]["doc_id"],
            "doc_name": hit["entity"]["doc_name"],
            "content": hit["entity"]["content"],
            "chunk_index": hit["entity"]["chunk_index"],
            "score": hit["distance"]
        })
    return hits


def list_documents() -> List[Dict[str, Any]]:
    """获取所有文档列表（去重），避免逐文档 N+1 查询

    实现思路：
    1. 先查询 chunk_index == 0 的记录，拿到每个文档的基础信息（1 条/文档）
    2. 再用 doc_id in [...] 一次性查询所有文档的 chunk_index，统计 chunk 数量
    """
    client = get_milvus_client()
    try:
        # 步骤 1：每个文档一条“头块”记录
        headers = client.query(
            collection_name=settings.collection_name,
            filter="chunk_index == 0",
            output_fields=["doc_id", "doc_name", "doc_type", "created_at"],
            limit=1000
        )
    except Exception:
        return []

    if not headers:
        return []

    # 所有文档 ID 列表
    doc_ids = [h["doc_id"] for h in headers]

    # 步骤 2：一次性查询所有相关文档的 chunk_index，并在内存中聚合统计
    # 表达式示例：doc_id in ["id1", "id2", ...]
    id_list_expr = ", ".join(f'"{doc_id}"' for doc_id in doc_ids)
    try:
        # Milvus 对 limit 有上限（通常为 16384），这里取一个安全上限
        chunks = client.query(
            collection_name=settings.collection_name,
            filter=f"doc_id in [{id_list_expr}]",
            output_fields=["doc_id", "chunk_index"],
            limit=16_384,
        )
    except Exception:
        # 如果统计失败，至少返回基础文档信息（chunk_count 退化为 1）
        return [
            {
                "doc_id": h["doc_id"],
                "doc_name": h["doc_name"],
                "doc_type": h.get("doc_type", "unknown"),
                "chunk_count": 1,
                "created_at": h.get("created_at", ""),
            }
            for h in headers
        ]

    # 统计每个文档的块数量
    counts: Dict[str, int] = {}
    for item in chunks:
        did = item.get("doc_id")
        if not did:
            continue
        counts[did] = counts.get(did, 0) + 1

    docs: List[Dict[str, Any]] = []
    for h in headers:
        did = h["doc_id"]
        docs.append(
            {
                "doc_id": did,
                "doc_name": h["doc_name"],
                "doc_type": h.get("doc_type", "unknown"),
                "chunk_count": counts.get(did, 0),
                "created_at": h.get("created_at", ""),
            }
        )
    return docs


def get_document_meta(doc_id: str) -> Dict[str, Any] | None:
    """获取单个文档的基础元信息（主要用于根据 doc_id 查 doc_name）"""
    client = get_milvus_client()
    try:
        results = client.query(
            collection_name=settings.collection_name,
            filter=f'doc_id == "{doc_id}" and chunk_index == 0',
            output_fields=["doc_id", "doc_name", "doc_type", "created_at"],
            limit=1,
        )
    except Exception:
        return None

    if not results:
        return None
    return results[0]


def delete_document(doc_id: str) -> bool:
    """删除指定文档的所有块"""
    client = get_milvus_client()
    client.delete(
        collection_name=settings.collection_name,
        filter=f'doc_id == "{doc_id}"'
    )
    return True


def document_exists(doc_id: str) -> bool:
    client = get_milvus_client()
    results = client.query(
        collection_name=settings.collection_name,
        filter=f'doc_id == "{doc_id}"',
        output_fields=["doc_id"],
        limit=1
    )
    return len(results) > 0


def get_document_chunks(doc_id: str) -> List[Dict[str, Any]]:
    """获取指定文档的全部文本块，按 chunk_index 升序排列"""
    client = get_milvus_client()
    results = client.query(
        collection_name=settings.collection_name,
        filter=f'doc_id == "{doc_id}"',
        output_fields=["doc_id", "doc_name", "doc_type", "content", "chunk_index"],
        limit=10000
    )
    return sorted(results, key=lambda x: x.get("chunk_index", 0))
