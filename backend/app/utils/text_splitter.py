import re
from typing import List


class TextSplitter:
    """递归字符文本分割器，优先按段落/句子分割，超限再按字符截断"""

    def __init__(self, chunk_size: int = 500, chunk_overlap: int = 50):
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap
        self.separators = ["\n\n", "\n", "。", "！", "？", ".", "!", "?", " ", ""]

    def split_text(self, text: str) -> List[str]:
        text = self._clean_text(text)
        if not text:
            return []
        return self._split_recursive(text, self.separators)

    def _clean_text(self, text: str) -> str:
        text = re.sub(r'\n{3,}', '\n\n', text)
        text = re.sub(r' {2,}', ' ', text)
        return text.strip()

    def _split_recursive(self, text: str, separators: List[str]) -> List[str]:
        if len(text) <= self.chunk_size:
            return [text] if text.strip() else []

        separator = separators[0] if separators else ""
        remaining_separators = separators[1:] if len(separators) > 1 else []

        splits = text.split(separator) if separator else list(text)
        chunks = []
        current_chunk = ""

        for split in splits:
            split_with_sep = split + separator if separator else split
            if len(current_chunk) + len(split_with_sep) <= self.chunk_size:
                current_chunk += split_with_sep
            else:
                if current_chunk.strip():
                    if len(current_chunk) > self.chunk_size and remaining_separators:
                        sub_chunks = self._split_recursive(current_chunk, remaining_separators)
                        chunks.extend(sub_chunks)
                    else:
                        chunks.append(current_chunk.strip())
                current_chunk = split_with_sep

        if current_chunk.strip():
            if len(current_chunk) > self.chunk_size and remaining_separators:
                sub_chunks = self._split_recursive(current_chunk, remaining_separators)
                chunks.extend(sub_chunks)
            else:
                chunks.append(current_chunk.strip())

        return self._merge_short_chunks(chunks)

    def _merge_short_chunks(self, chunks: List[str]) -> List[str]:
        if not chunks:
            return []

        result = []
        for chunk in chunks:
            if not chunk.strip():
                continue
            if result and len(result[-1]) + len(chunk) < self.chunk_size * 0.5:
                result[-1] = result[-1] + "\n" + chunk
            else:
                result.append(chunk)

        # 添加重叠
        if self.chunk_overlap > 0 and len(result) > 1:
            overlapped = []
            for i, chunk in enumerate(result):
                if i > 0:
                    prev_tail = result[i - 1][-self.chunk_overlap:]
                    chunk = prev_tail + chunk
                overlapped.append(chunk)
            return overlapped

        return result
