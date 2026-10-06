from __future__ import annotations

import io
import re
from pathlib import Path

from bs4 import BeautifulSoup
from docx import Document
from ebooklib import epub, ITEM_DOCUMENT
from pypdf import PdfReader

SUPPORTED_EXTENSIONS = {".txt", ".md", ".markdown", ".epub", ".docx", ".pdf"}
MAX_FILE_SIZE = 20 * 1024 * 1024


class ParseError(ValueError):
    pass


_ENCODING_ALIASES = {
    "windows-1251": "cp1251",
    "win-1251": "cp1251",
    "cp-1251": "cp1251",
    "koi8r": "koi8-r",
    "koi8_r": "koi8-r",
    "utf8": "utf-8",
}

# The legacy Russian web contains both Windows-1251 and KOI8-R. Both byte streams
# can be decoded by cp1251 without an exception, so "first successful decoder wins"
# is not enough. These language hints let us choose the actually readable result.
_RU_BIGRAMS = (
    "ст", "но", "ен", "то", "на", "ов", "ни", "ра", "во", "ко", "пр", "по",
    "ро", "ос", "го", "ть", "ли", "ре", "ер", "ал", "не", "ло", "та", "ск",
    "ил", "ла", "ет", "ол", "ом", "ка", "ме", "ва", "ит", "ес", "де", "ор",
)
_RU_WORDS = (
    " и ", " в ", " не ", " на ", " что ", " как ", " по ", " с ", " а ",
    " я ", " из ", " это ", " он ", " она ", " мы ", " для ", " был ", " было ",
    " мне ", " у ", " его ", " но ", " к ", " от ", " за ",
)


def _normalize_encoding_name(value: str | None) -> str | None:
    if not value:
        return None
    value = value.strip().strip('"\'').lower()
    return _ENCODING_ALIASES.get(value, value)


def _encoding_from_markup(data: bytes) -> str | None:
    # charset declarations are ASCII-compatible even when the document body is not.
    head = data[:8192].decode("latin-1", errors="ignore")
    match = re.search(r"charset\s*=\s*[\"']?\s*([a-zA-Z0-9._-]+)", head, flags=re.I)
    return _normalize_encoding_name(match.group(1)) if match else None


def _text_quality_score(text: str) -> float:
    if not text:
        return -10_000
    score = 0.0
    lowered = f" {text.lower()} "

    score += sum(lowered.count(pair) for pair in _RU_BIGRAMS) * 0.7
    score += sum(lowered.count(word) for word in _RU_WORDS) * 3.0

    cyrillic = [ch for ch in text if "\u0400" <= ch <= "\u04ff"]
    if len(cyrillic) > 30:
        upper_ratio = sum(ch.isupper() for ch in cyrillic) / len(cyrillic)
        # Typical KOI8-R decoded as Windows-1251 produces text such as
        # "бМШВЕТ лБНА. рПУФПТПООЙК" with an implausibly high uppercase ratio.
        if upper_ratio > 0.35:
            score -= (upper_ratio - 0.35) * 80

    score -= text.count("\ufffd") * 25
    score -= sum(ord(ch) < 32 and ch not in "\n\r\t" for ch in text) * 8

    # Box-drawing characters are a strong sign that DOS CP866 was chosen incorrectly.
    score -= sum("\u2500" <= ch <= "\u259f" for ch in text) * 3
    return score


def _decode_text(data: bytes, encoding_hint: str | None = None) -> str:
    hint = _normalize_encoding_name(encoding_hint)
    markup_hint = _encoding_from_markup(data)

    candidates: list[str] = []
    ordered_encodings = [hint, markup_hint, "utf-8-sig", "utf-8", "koi8-r", "cp1251", "cp866", "cp1252", "latin-1"]
    if data.startswith((b"\xff\xfe", b"\xfe\xff")):
        ordered_encodings.insert(2, "utf-16")
    for encoding in ordered_encodings:
        if encoding and encoding not in candidates:
            candidates.append(encoding)

    decoded: list[tuple[float, int, str]] = []
    for index, encoding in enumerate(candidates):
        try:
            value = data.decode(encoding)
        except (UnicodeDecodeError, LookupError):
            continue
        score = _text_quality_score(value)
        if encoding == hint:
            score += 8  # HTTP Content-Type is useful, but not trusted blindly.
        if encoding == markup_hint:
            score += 6
        if encoding in {"utf-8", "utf-8-sig"}:
            score += 4
        decoded.append((score, -index, value))

    if not decoded:
        raise ParseError("Не удалось определить кодировку файла")
    decoded.sort(reverse=True, key=lambda item: (item[0], item[1]))
    return decoded[0][2]


def _normalize(text: str) -> str:
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"[ \t]+\n", "\n", text)
    text = re.sub(r"\n{4,}", "\n\n\n", text)
    return text.strip()


def _normalize_markdown(text: str) -> str:
    # Do not trim end-of-line spaces: in Markdown they can represent an explicit <br>.
    return text.replace("\r\n", "\n").replace("\r", "\n").strip()


def _html_to_text(html: str | bytes) -> str:
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(["script", "style", "nav", "noscript"]):
        tag.decompose()
    for br in soup.find_all("br"):
        br.replace_with("\n")
    for tag in soup.find_all(["p", "div", "section", "li", "blockquote", "h1", "h2", "h3", "h4", "pre"]):
        tag.append("\n")
    return _normalize(soup.get_text(" "))


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


def _split_text_into_chapters(text: str, target_size: int = 18000, content_format: str = "plain") -> list[dict]:
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
                chapters.append({"title": "Начало", "text": preface, "format": content_format})
        for pos_index, start in enumerate(heading_positions):
            end = heading_positions[pos_index + 1] if pos_index + 1 < len(heading_positions) else len(lines)
            heading = re.sub(r"^#{1,4}\s+", "", lines[start].strip())
            body = _normalize("\n".join(lines[start + 1:end]))
            if body:
                chapters.append({"title": heading[:120], "text": body, "format": content_format})

    if not chapters:
        paragraphs = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]
        buffer: list[str] = []
        size = 0
        for paragraph in paragraphs:
            if buffer and size + len(paragraph) > target_size:
                chapters.append({"title": f"Раздел {len(chapters) + 1}", "text": "\n\n".join(buffer), "format": content_format})
                buffer, size = [], 0
            buffer.append(paragraph)
            size += len(paragraph)
        if buffer:
            chapters.append({"title": f"Раздел {len(chapters) + 1}", "text": "\n\n".join(buffer), "format": content_format})

    return chapters


def _clean_markdown_heading(value: str) -> str:
    value = re.sub(r"^#{1,6}\s+", "", value.strip())
    value = re.sub(r"\s+#+\s*$", "", value)
    value = re.sub(r"[*_~`]", "", value)
    value = re.sub(r"\[(.*?)\]\([^)]*\)", r"\1", value)
    return value.strip() or "Раздел"


def _split_markdown_into_chapters(markdown: str, target_size: int = 18000) -> list[dict]:
    markdown = _normalize_markdown(markdown)
    if not markdown:
        raise ParseError("В файле не найден читаемый текст")

    lines = markdown.split("\n")
    headings: list[tuple[int, str]] = []
    in_fence = False
    fence_marker = ""

    for index, line in enumerate(lines):
        stripped = line.lstrip()
        fence = re.match(r"^(```+|~~~+)", stripped)
        if fence:
            marker = fence.group(1)[0]
            if not in_fence:
                in_fence = True
                fence_marker = marker
            elif marker == fence_marker:
                in_fence = False
                fence_marker = ""
            continue
        if in_fence:
            continue
        match = re.match(r"^\s{0,3}(#{1,2})\s+(.+?)\s*$", line)
        if match:
            headings.append((index, _clean_markdown_heading(match.group(2))))

    chapters: list[dict] = []
    if headings:
        first = headings[0][0]
        preface = _normalize_markdown("\n".join(lines[:first]))
        if len(preface) > 80:
            chapters.append({"title": "Начало", "text": preface, "format": "markdown"})

        for position, (start, title) in enumerate(headings):
            end = headings[position + 1][0] if position + 1 < len(headings) else len(lines)
            body = _normalize_markdown("\n".join(lines[start + 1:end]))
            if body:
                chapters.append({"title": title[:120], "text": body, "format": "markdown"})

    if not chapters:
        blocks = [block for block in re.split(r"\n{2,}", markdown) if block.strip()]
        buffer: list[str] = []
        size = 0
        for block in blocks:
            if buffer and size + len(block) > target_size:
                chapters.append({"title": f"Раздел {len(chapters) + 1}", "text": "\n\n".join(buffer), "format": "markdown"})
                buffer, size = [], 0
            buffer.append(block)
            size += len(block)
        if buffer:
            chapters.append({"title": f"Раздел {len(chapters) + 1}", "text": "\n\n".join(buffer), "format": "markdown"})

    return chapters


def _parse_txt_or_md(data: bytes, ext: str, encoding_hint: str | None = None) -> tuple[str | None, str | None, list[dict]]:
    text = _decode_text(data, encoding_hint=encoding_hint)
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
        return title, author, _split_text_into_chapters(text, content_format="plain")

    if ext in {".md", ".markdown"}:
        return None, None, _split_markdown_into_chapters(text)
    return None, None, _split_text_into_chapters(text, content_format="plain")


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
    return title, author, _split_text_into_chapters("\n\n".join(blocks), content_format="plain")


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
    return title, author, _split_text_into_chapters("\n\n".join(texts), content_format="plain")


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
        chapters.append({"title": chapter_title[:120] or f"Раздел {len(chapters) + 1}", "text": text, "format": "plain"})
    if not chapters:
        raise ParseError("В EPUB не найден читаемый текст")
    return title, author, chapters


def parse_book(filename: str, data: bytes, encoding_hint: str | None = None) -> dict:
    if not data:
        raise ParseError("Файл пуст")
    if len(data) > MAX_FILE_SIZE:
        raise ParseError("Файл слишком большой. Максимум — 20 МБ")

    ext = Path(filename).suffix.lower()
    if ext not in SUPPORTED_EXTENSIONS:
        raise ParseError("Поддерживаются TXT, MD, EPUB, DOCX и PDF")

    if ext in {".txt", ".md", ".markdown"}:
        title, author, chapters = _parse_txt_or_md(data, ext, encoding_hint=encoding_hint)
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


def repair_legacy_russian_mojibake(text: str | None) -> str | None:
    """Repair the common KOI8-R -> CP1251 misdecode produced by BookNest <= 1.1.

    The conversion is applied only when the repaired variant scores substantially
    better as Russian text, so ordinary Cyrillic strings are left untouched.
    """
    if not text or len(text) < 4:
        return text
    try:
        repaired = text.encode("cp1251").decode("koi8-r")
    except (UnicodeEncodeError, UnicodeDecodeError):
        return text
    improvement_needed = 4 if len(text) < 80 else 12
    if _text_quality_score(repaired) >= _text_quality_score(text) + improvement_needed:
        return repaired
    return text
