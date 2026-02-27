from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    zhipu_api_key: str = ""
    milvus_uri: str = "./milvus_data.db"
    embedding_model: str = "embedding-3"
    chat_model: str = "glm-4.7"
    chunk_size: int = 500
    chunk_overlap: int = 50
    top_k: int = 5
    upload_dir: str = "./uploads"
    max_file_size: int = 20 * 1024 * 1024  # 20MB
    collection_name: str = "knowledge_base"
    embedding_dim: int = 2048  # embedding-3 默认维度（embedding-2 为 1024）

    class Config:
        env_file = ".env"
        case_sensitive = False


@lru_cache()
def get_settings() -> Settings:
    return Settings()
