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
    """获取所有文档列表（去重）"""
    client = get_milvus_client()
    try:
        results = client.query(
            collection_name=settings.collection_name,
            filter="chunk_index == 0",
            output_fields=["doc_id", "doc_name", "doc_type", "created_at"],
            limit=1000
        )
    except Exception:
        return []

    # 统计每个文档的 chunk 数
    docs = []
    for item in results:
        count_result = client.query(
            collection_name=settings.collection_name,
            filter=f'doc_id == "{item["doc_id"]}"',
            output_fields=["chunk_index"],
            limit=10000
        )
        docs.append({
            "doc_id": item["doc_id"],
            "doc_name": item["doc_name"],
            "doc_type": item.get("doc_type", "unknown"),
            "chunk_count": len(count_result),
            "created_at": item.get("created_at", "")
        })
    return docs


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
