from __future__ import annotations

import io
import re
from pathlib import Path
from typing import Iterable

from bs4 import BeautifulSoup
from docx import Document
from ebooklib import epub, ITEM_DOCUMENT
from markdown_it import MarkdownIt
from pypdf import PdfReader

SUPPORTED_EXTENSIONS = {".txt", ".md", ".markdown", ".epub", ".docx", ".pdf"}
MAX_FILE_SIZE = 20 * 1024 * 1024


class ParseError(ValueError):
    pass


def _decode_text(data: bytes) -> str:
    for encoding in ("utf-8-sig", "utf-8", "cp1251", "cp1252", "latin-1"):
        try:
            return data.decode(encoding)
        except UnicodeDecodeError:
            continue
    raise ParseError("Не удалось определить кодировку файла")


def _normalize(text: str) -> str:
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"[ \t]+\n", "\n", text)
    text = re.sub(r"\n{4,}", "\n\n\n", text)
    return text.strip()


def _html_to_text(html: str | bytes) -> str:
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(["script", "style", "nav"]):
        tag.decompose()
    for br in soup.find_all("br"):
        br.replace_with("\n")
    for tag in soup.find_all(["p", "div", "section", "li", "blockquote", "h1", "h2", "h3", "h4"]):
        tag.append("\n")
    return _normalize(soup.get_text(" "))


def _markdown_to_text(md_text: str) -> str:
    tokens = MarkdownIt("commonmark").parse(md_text)
    parts: list[str] = []
    for token in tokens:
        if token.type == "inline" and token.content:
            parts.append(token.content)
        elif token.type in {"fence", "code_block"} and token.content:
            parts.append(token.content)
    return _normalize("\n\n".join(parts))


def _looks_like_heading(line: str) -> bool:
    value = line.strip()
    if not 2 <= len(value) <= 100:
        return False
    patterns = [
        r"^(глава|chapter|часть|part|книга|book)\s+[\divxlcdmа-яё]+[\s.:—-].*$",
        r"^(пролог|эпилог|prologue|epilogue)$",
        r"^#{1,4}\s+.+$",
    ]
    if any(re.match(p, value, flags=re.I) for p in patterns):
        return True
    words = value.split()
    return len(words) <= 8 and value.isupper() and any(ch.isalpha() for ch in value)


def _split_text_into_chapters(text: str, target_size: int = 18000) -> list[dict]:
    text = _normalize(text)
    if not text:
        raise ParseError("В файле не найден читаемый текст")

    lines = text.split("\n")
    heading_positions = [i for i, line in enumerate(lines) if _looks_like_heading(line)]
    chapters: list[dict] = []

    if heading_positions:
        first = heading_positions[0]
        if first > 0:
            preface = _normalize("\n".join(lines[:first]))
            if len(preface) > 150:
                chapters.append({"title": "Начало", "text": preface})
        for pos_index, start in enumerate(heading_positions):
            end = heading_positions[pos_index + 1] if pos_index + 1 < len(heading_positions) else len(lines)
            heading = re.sub(r"^#{1,4}\s+", "", lines[start].strip())
            body = _normalize("\n".join(lines[start + 1:end]))
            if body:
                chapters.append({"title": heading[:120], "text": body})

    if not chapters:
        paragraphs = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]
        buffer: list[str] = []
        size = 0
        for paragraph in paragraphs:
            if buffer and size + len(paragraph) > target_size:
                chapters.append({"title": f"Раздел {len(chapters) + 1}", "text": "\n\n".join(buffer)})
                buffer, size = [], 0
            buffer.append(paragraph)
            size += len(paragraph)
        if buffer:
            chapters.append({"title": f"Раздел {len(chapters) + 1}", "text": "\n\n".join(buffer)})

    return chapters


def _parse_txt_or_md(data: bytes, ext: str) -> tuple[str | None, str | None, list[dict]]:
    text = _decode_text(data)
    stripped = text.lstrip().lower()
    if stripped.startswith("<!doctype html") or stripped.startswith("<html") or "<body" in stripped[:3000]:
        soup = BeautifulSoup(text, "html.parser")
        title = None
        author = None
        title_tag = soup.find("title")
        heading = soup.find(["h1", "h2"])
        if heading:
            title = heading.get_text(" ", strip=True) or None
        elif title_tag:
            title = title_tag.get_text(" ", strip=True) or None
        author_meta = soup.find("meta", attrs={"name": re.compile(r"^author$", re.I)})
        if author_meta and author_meta.get("content"):
            author = str(author_meta.get("content")).strip() or None
        text = _html_to_text(text)
        return title, author, _split_text_into_chapters(text)

    if ext in {".md", ".markdown"}:
        # Preserve heading lines for chapter detection, but remove inline markdown noise from body chunks.
        raw_lines = text.splitlines()
        rebuilt: list[str] = []
        for line in raw_lines:
            if re.match(r"^#{1,4}\s+", line.strip()):
                rebuilt.append(line)
            else:
                rebuilt.append(_markdown_to_text(line) if line.strip() else "")
        text = "\n".join(rebuilt)
    return None, None, _split_text_into_chapters(text)


def _parse_docx(data: bytes) -> tuple[str | None, str | None, list[dict]]:
    doc = Document(io.BytesIO(data))
    title = doc.core_properties.title or None
    author = doc.core_properties.author or None
    blocks: list[str] = []
    for paragraph in doc.paragraphs:
        value = paragraph.text.strip()
        if not value:
            blocks.append("")
            continue
        style = (paragraph.style.name or "").lower() if paragraph.style else ""
        if "heading" in style or "заголов" in style:
            blocks.append(f"# {value}" if len(value) < 100 else value)
        else:
            blocks.append(value)
    return title, author, _split_text_into_chapters("\n\n".join(blocks))


def _parse_pdf(data: bytes) -> tuple[str | None, str | None, list[dict]]:
    reader = PdfReader(io.BytesIO(data))
    if reader.is_encrypted:
        try:
            reader.decrypt("")
        except Exception as exc:
            raise ParseError("PDF защищён паролем") from exc
    texts = [(page.extract_text() or "") for page in reader.pages]
    meta = reader.metadata or {}
    title = getattr(meta, "title", None) or None
    author = getattr(meta, "author", None) or None
    return title, author, _split_text_into_chapters("\n\n".join(texts))


def _parse_epub(data: bytes) -> tuple[str | None, str | None, list[dict]]:
    book = epub.read_epub(io.BytesIO(data))
    title_meta = book.get_metadata("DC", "title")
    author_meta = book.get_metadata("DC", "creator")
    title = title_meta[0][0] if title_meta else None
    author = author_meta[0][0] if author_meta else None
    chapters: list[dict] = []
    for item in book.get_items_of_type(ITEM_DOCUMENT):
        text = _html_to_text(item.get_content())
        if len(text) < 80:
            continue
        soup = BeautifulSoup(item.get_content(), "html.parser")
        heading = soup.find(["h1", "h2", "h3"])
        chapter_title = heading.get_text(" ", strip=True) if heading else Path(item.get_name()).stem
        chapters.append({"title": chapter_title[:120] or f"Раздел {len(chapters) + 1}", "text": text})
    if not chapters:
        raise ParseError("В EPUB не найден читаемый текст")
    return title, author, chapters


def parse_book(filename: str, data: bytes) -> dict:
    if not data:
        raise ParseError("Файл пуст")
    if len(data) > MAX_FILE_SIZE:
        raise ParseError("Файл слишком большой. Максимум — 20 МБ")

    ext = Path(filename).suffix.lower()
    if ext not in SUPPORTED_EXTENSIONS:
        raise ParseError("Поддерживаются TXT, MD, EPUB, DOCX и PDF")

    if ext in {".txt", ".md", ".markdown"}:
        title, author, chapters = _parse_txt_or_md(data, ext)
    elif ext == ".docx":
        title, author, chapters = _parse_docx(data)
    elif ext == ".pdf":
        title, author, chapters = _parse_pdf(data)
    else:
        title, author, chapters = _parse_epub(data)

    fallback_title = Path(filename).stem.replace("_", " ").replace("-", " ").strip()
    total_chars = sum(len(c["text"]) for c in chapters)
    return {
        "title": (title or fallback_title or "Без названия")[:500],
        "author": author[:300] if author else None,
        "chapters": chapters,
        "total_chars": total_chars,
        "file_format": ext.lstrip("."),
    }
