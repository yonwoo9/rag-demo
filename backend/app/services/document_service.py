import os
import uuid
import hashlib
from pathlib import Path
from typing import List
import aiofiles

from app.config import get_settings
from app.utils.text_splitter import TextSplitter

settings = get_settings()


async def parse_document(file_path: str, filename: str) -> List[str]:
    """解析文档，返回文本块列表"""
    ext = Path(filename).suffix.lower()
    text = ""

    if ext == ".pdf":
        text = await _parse_pdf(file_path)
    elif ext in (".docx", ".doc"):
        text = await _parse_docx(file_path)
    elif ext in (".txt", ".md"):
        text = await _parse_text(file_path)
    else:
        raise ValueError(f"不支持的文件类型: {ext}")

    if not text.strip():
        raise ValueError("文档内容为空，无法处理")

    splitter = TextSplitter(
        chunk_size=settings.chunk_size,
        chunk_overlap=settings.chunk_overlap
    )
    chunks = splitter.split_text(text)

    if not chunks:
        raise ValueError("文档分块失败，内容可能过短")

    return chunks


async def _parse_pdf(file_path: str) -> str:
    from pypdf import PdfReader
    reader = PdfReader(file_path)
    texts = []
    for page in reader.pages:
        page_text = page.extract_text()
        if page_text:
            texts.append(page_text)
    return "\n\n".join(texts)


async def _parse_docx(file_path: str) -> str:
    from docx import Document
    doc = Document(file_path)
    paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
    return "\n\n".join(paragraphs)


async def _parse_text(file_path: str) -> str:
    async with aiofiles.open(file_path, "r", encoding="utf-8", errors="ignore") as f:
        return await f.read()


def generate_doc_id(filename: str) -> str:
    return hashlib.md5(f"{filename}_{uuid.uuid4()}".encode()).hexdigest()


async def save_upload_file(file_content: bytes, filename: str) -> str:
    upload_dir = Path(settings.upload_dir)
    upload_dir.mkdir(parents=True, exist_ok=True)
    safe_name = f"{uuid.uuid4()}_{filename}"
    file_path = upload_dir / safe_name
    async with aiofiles.open(file_path, "wb") as f:
        await f.write(file_content)
    return str(file_path)
