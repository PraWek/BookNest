from __future__ import annotations

from pathlib import Path
from typing import Annotated
from urllib.parse import unquote, urljoin, urlparse
import base64
import ipaddress
import re
import socket

import httpx
import edge_tts

from fastapi import Depends, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from sqlalchemy import select
from sqlalchemy.orm import Session

from .database import Base, engine, get_db
from .models import Book, Bookmark, Preference, ReadingProgress
from .parser import ParseError, parse_book, repair_legacy_russian_mojibake
from .schemas import (
    BookmarkIn,
    BookmarkOut,
    BookDetail,
    BookPatch,
    BookSummary,
    PreferencesIn,
    PreferencesOut,
    ProgressIn,
    ProgressOut,
    UrlImportIn,
    TtsSpeechIn,
    TtsVoiceOut,
    TtsNarrationOut,
    TtsWordBoundaryOut,
)

Base.metadata.create_all(bind=engine)
app = FastAPI(title="BookNest API", version="1.3.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def progress_out(progress: ReadingProgress | None) -> ProgressOut | None:
    if not progress:
        return None
    return ProgressOut(
        chapter_index=progress.chapter_index,
        scroll_percent=progress.scroll_percent,
        updated_at=progress.updated_at,
    )


def summary_out(book: Book) -> BookSummary:
    return BookSummary(
        id=book.id,
        title=repair_legacy_russian_mojibake(book.title) or book.title,
        author=repair_legacy_russian_mojibake(book.author),
        filename=book.filename,
        file_format=book.file_format,
        total_chars=book.total_chars,
        chapter_count=len(book.chapters or []),
        created_at=book.created_at,
        updated_at=book.updated_at,
        progress=progress_out(book.progress),
    )


def detail_out(book: Book) -> BookDetail:
    base = summary_out(book).model_dump()
    is_markdown = book.file_format.lower() in {"md", "markdown"}
    chapters = []
    for chapter in book.chapters or []:
        item = dict(chapter)
        item["title"] = repair_legacy_russian_mojibake(str(item.get("title") or "Раздел")) or "Раздел"
        item["text"] = repair_legacy_russian_mojibake(str(item.get("text") or "")) or ""
        if not item.get("format"):
            item["format"] = "markdown" if is_markdown else "plain"
        chapters.append(item)
    return BookDetail(**base, chapters=chapters)


URL_MAX_REDIRECTS = 5
URL_TIMEOUT = httpx.Timeout(20.0, connect=10.0)


def _validate_public_url(url: str) -> None:
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"}:
        raise HTTPException(status_code=400, detail="Разрешены только HTTP/HTTPS ссылки")
    if not parsed.hostname:
        raise HTTPException(status_code=400, detail="Некорректная ссылка")
    if parsed.port and parsed.port not in {80, 443}:
        raise HTTPException(status_code=400, detail="Разрешены только стандартные HTTP/HTTPS порты")
    try:
        infos = socket.getaddrinfo(parsed.hostname, parsed.port or (443 if parsed.scheme == "https" else 80), type=socket.SOCK_STREAM)
    except socket.gaierror as exc:
        raise HTTPException(status_code=400, detail="Не удалось найти сайт по этому адресу") from exc
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if not ip.is_global:
            raise HTTPException(status_code=400, detail="Ссылки на локальные и внутренние адреса запрещены")


def _filename_from_url(url: str, content_type: str) -> str:
    name = Path(unquote(urlparse(url).path)).name or "book"
    ext = Path(name).suffix.lower()
    if ext in {".txt", ".md", ".markdown", ".epub", ".docx", ".pdf"}:
        return name[:500]
    media = content_type.split(";", 1)[0].strip().lower()
    mapping = {
        "application/pdf": ".pdf",
        "application/epub+zip": ".epub",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
        "text/markdown": ".md",
        "text/plain": ".txt",
        "text/html": ".txt",
        "application/xhtml+xml": ".txt",
    }
    suffix = mapping.get(media)
    if not suffix:
        raise HTTPException(status_code=400, detail="По ссылке найден неподдерживаемый тип файла")
    stem = Path(name).stem if name else "book"
    return f"{stem or 'book'}{suffix}"[:500]


async def _download_public_book(url: str) -> tuple[str, bytes, str | None]:
    current = url
    headers = {"User-Agent": "BookNest/1.2 (+book importer)", "Accept": "text/plain,text/html,application/pdf,application/epub+zip,application/octet-stream,*/*;q=0.5"}
    async with httpx.AsyncClient(timeout=URL_TIMEOUT, headers=headers) as client:
        for _ in range(URL_MAX_REDIRECTS + 1):
            _validate_public_url(current)
            try:
                async with client.stream("GET", current, follow_redirects=False) as response:
                    if response.status_code in {301, 302, 303, 307, 308}:
                        location = response.headers.get("location")
                        if not location:
                            raise HTTPException(status_code=400, detail="Сайт вернул некорректный редирект")
                        current = urljoin(current, location)
                        continue
                    if response.status_code >= 400:
                        raise HTTPException(status_code=400, detail=f"Сайт вернул ошибку HTTP {response.status_code}")
                    content_type = response.headers.get("content-type", "")
                    filename = _filename_from_url(current, content_type)
                    content_length = response.headers.get("content-length")
                    if content_length and content_length.isdigit() and int(content_length) > 20 * 1024 * 1024:
                        raise HTTPException(status_code=413, detail="Файл по ссылке больше 20 МБ")
                    chunks: list[bytes] = []
                    total = 0
                    async for chunk in response.aiter_bytes():
                        total += len(chunk)
                        if total > 20 * 1024 * 1024:
                            raise HTTPException(status_code=413, detail="Файл по ссылке больше 20 МБ")
                        chunks.append(chunk)
                    charset_match = re.search(r"charset\s*=\s*[\"']?\s*([a-zA-Z0-9._-]+)", content_type, flags=re.I)
                    encoding_hint = charset_match.group(1) if charset_match else None
                    return filename, b"".join(chunks), encoding_hint
            except httpx.HTTPError as exc:
                raise HTTPException(status_code=400, detail="Не удалось скачать книгу по ссылке") from exc
    raise HTTPException(status_code=400, detail="Слишком много перенаправлений по ссылке")


def _create_book_from_bytes(filename: str, data: bytes, db: Session, encoding_hint: str | None = None) -> Book:
    try:
        parsed = parse_book(filename, data, encoding_hint=encoding_hint)
    except ParseError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Не удалось обработать файл: {exc}") from exc

    book = Book(
        title=parsed["title"],
        author=parsed["author"],
        filename=filename[:500],
        file_format=parsed["file_format"],
        chapters=parsed["chapters"],
        total_chars=parsed["total_chars"],
    )
    db.add(book)
    db.flush()
    db.add(ReadingProgress(book_id=book.id, chapter_index=0, scroll_percent=0))
    db.commit()
    db.refresh(book)
    return book


TTS_VOICES = [
    {"id": "ru-RU-SvetlanaNeural", "name": "Светлана", "language": "Русский", "description": "Мягкий, спокойный женский", "gender": "female"},
    {"id": "ru-RU-DmitryNeural", "name": "Дмитрий", "language": "Русский", "description": "Спокойный, низкий мужской", "gender": "male"},
    {"id": "en-US-EmmaMultilingualNeural", "name": "Emma", "language": "Мультиязычный", "description": "Живой и естественный женский", "gender": "female"},
    {"id": "en-US-AvaMultilingualNeural", "name": "Ava", "language": "Мультиязычный", "description": "Выразительный женский", "gender": "female"},
    {"id": "en-US-AndrewMultilingualNeural", "name": "Andrew", "language": "Мультиязычный", "description": "Естественный мужской", "gender": "male"},
    {"id": "en-US-BrianMultilingualNeural", "name": "Brian", "language": "Мультиязычный", "description": "Тёплый мужской", "gender": "male"},
]
TTS_VOICE_IDS = {voice["id"] for voice in TTS_VOICES}


@app.get("/api/tts/voices", response_model=list[TtsVoiceOut])
def tts_voices():
    return TTS_VOICES


async def synthesize_speech(payload: TtsSpeechIn) -> tuple[bytes, list[TtsWordBoundaryOut]]:
    if payload.voice not in TTS_VOICE_IDS:
        raise HTTPException(status_code=400, detail="Неизвестный голос")
    text = re.sub(r"\s+", " ", payload.text).strip()
    if not text:
        raise HTTPException(status_code=400, detail="Нет текста для озвучивания")

    percent = round((payload.rate - 1.0) * 100)
    rate = f"{percent:+d}%"
    try:
        communicate = edge_tts.Communicate(text=text, voice=payload.voice, rate=rate, boundary="WordBoundary")
        audio = bytearray()
        boundaries = []
        async for message in communicate.stream():
            if message["type"] == "audio":
                audio.extend(message["data"])
            elif message["type"] == "WordBoundary":
                # Edge reports offsets and durations in 100-nanosecond ticks.
                boundaries.append(TtsWordBoundaryOut(
                    start=message["offset"] / 10_000_000,
                    duration=message["duration"] / 10_000_000,
                    text=message["text"],
                ))
        if not audio:
            raise RuntimeError("TTS returned empty audio")
    except Exception as exc:
        raise HTTPException(status_code=502, detail="Сервис neural-озвучки временно недоступен") from exc

    return bytes(audio), boundaries


@app.post("/api/tts/speech")
async def tts_speech(payload: TtsSpeechIn):
    audio, _ = await synthesize_speech(payload)
    return Response(
        content=audio,
        media_type="audio/mpeg",
        headers={"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"},
    )


@app.post("/api/tts/narration", response_model=TtsNarrationOut)
async def tts_narration(payload: TtsSpeechIn):
    audio, boundaries = await synthesize_speech(payload)
    return Response(
        content=TtsNarrationOut(audio=base64.b64encode(audio).decode("ascii"), boundaries=boundaries).model_dump_json(),
        media_type="application/json",
        headers={"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"},
    )


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/books", response_model=list[BookSummary])
def list_books(db: Session = Depends(get_db)):
    books = db.scalars(select(Book).order_by(Book.updated_at.desc())).all()
    return [summary_out(book) for book in books]


@app.post("/api/books/upload", response_model=BookDetail, status_code=201)
async def upload_book(file: Annotated[UploadFile, File(...)], db: Session = Depends(get_db)):
    filename = file.filename or "book.txt"
    data = await file.read()
    return detail_out(_create_book_from_bytes(filename, data, db))


@app.post("/api/books/import-url", response_model=BookDetail, status_code=201)
async def import_book_url(payload: UrlImportIn, db: Session = Depends(get_db)):
    filename, data, encoding_hint = await _download_public_book(str(payload.url))
    return detail_out(_create_book_from_bytes(filename, data, db, encoding_hint=encoding_hint))


@app.get("/api/books/{book_id}", response_model=BookDetail)
def get_book(book_id: int, db: Session = Depends(get_db)):
    book = db.get(Book, book_id)
    if not book:
        raise HTTPException(status_code=404, detail="Книга не найдена")
    return detail_out(book)


@app.patch("/api/books/{book_id}", response_model=BookDetail)
def patch_book(book_id: int, payload: BookPatch, db: Session = Depends(get_db)):
    book = db.get(Book, book_id)
    if not book:
        raise HTTPException(status_code=404, detail="Книга не найдена")
    if payload.title is not None:
        book.title = payload.title.strip()
    if payload.author is not None:
        book.author = payload.author.strip() or None
    db.commit()
    db.refresh(book)
    return detail_out(book)


@app.delete("/api/books/{book_id}", status_code=204)
def delete_book(book_id: int, db: Session = Depends(get_db)):
    book = db.get(Book, book_id)
    if not book:
        raise HTTPException(status_code=404, detail="Книга не найдена")
    db.delete(book)
    db.commit()


@app.put("/api/books/{book_id}/progress", response_model=ProgressOut)
def save_progress(book_id: int, payload: ProgressIn, db: Session = Depends(get_db)):
    book = db.get(Book, book_id)
    if not book:
        raise HTTPException(status_code=404, detail="Книга не найдена")
    if payload.chapter_index >= len(book.chapters or []):
        raise HTTPException(status_code=400, detail="Некорректный номер главы")
    progress = db.scalar(select(ReadingProgress).where(ReadingProgress.book_id == book_id))
    if progress is None:
        progress = ReadingProgress(book_id=book_id)
        db.add(progress)
    progress.chapter_index = payload.chapter_index
    progress.scroll_percent = payload.scroll_percent
    db.commit()
    db.refresh(progress)
    return progress_out(progress)


@app.get("/api/books/{book_id}/bookmarks", response_model=list[BookmarkOut])
def list_bookmarks(book_id: int, db: Session = Depends(get_db)):
    if not db.get(Book, book_id):
        raise HTTPException(status_code=404, detail="Книга не найдена")
    return db.scalars(select(Bookmark).where(Bookmark.book_id == book_id).order_by(Bookmark.created_at.desc())).all()


@app.post("/api/books/{book_id}/bookmarks", response_model=BookmarkOut, status_code=201)
def create_bookmark(book_id: int, payload: BookmarkIn, db: Session = Depends(get_db)):
    book = db.get(Book, book_id)
    if not book:
        raise HTTPException(status_code=404, detail="Книга не найдена")
    if payload.chapter_index >= len(book.chapters or []):
        raise HTTPException(status_code=400, detail="Некорректный номер главы")
    bookmark = Bookmark(book_id=book_id, **payload.model_dump())
    db.add(bookmark)
    db.commit()
    db.refresh(bookmark)
    return bookmark


@app.delete("/api/bookmarks/{bookmark_id}", status_code=204)
def delete_bookmark(bookmark_id: int, db: Session = Depends(get_db)):
    bookmark = db.get(Bookmark, bookmark_id)
    if not bookmark:
        raise HTTPException(status_code=404, detail="Закладка не найдена")
    db.delete(bookmark)
    db.commit()


DEFAULT_SETTINGS = {
    "theme": "paper",
    "fontFamily": "literata",
    "fontSize": 19,
    "lineHeight": 1.75,
    "contentWidth": 760,
    "letterSpacing": 0,
    "paragraphSpacing": 1.0,
    "textAlign": "left",
    "focusMode": False,
}


@app.get("/api/preferences", response_model=PreferencesOut)
def get_preferences(db: Session = Depends(get_db)):
    pref = db.get(Preference, 1)
    if not pref:
        return PreferencesOut(settings=DEFAULT_SETTINGS, updated_at=None)
    return PreferencesOut(settings={**DEFAULT_SETTINGS, **(pref.settings or {})}, updated_at=pref.updated_at)


@app.put("/api/preferences", response_model=PreferencesOut)
def save_preferences(payload: PreferencesIn, db: Session = Depends(get_db)):
    pref = db.get(Preference, 1)
    if not pref:
        pref = Preference(id=1, settings={})
        db.add(pref)
    pref.settings = {**DEFAULT_SETTINGS, **payload.settings}
    db.commit()
    db.refresh(pref)
    return PreferencesOut(settings=pref.settings, updated_at=pref.updated_at)


PROJECT_ROOT = Path(__file__).resolve().parents[2]
FRONTEND_DIST = PROJECT_ROOT / "frontend" / "dist"
if FRONTEND_DIST.exists():
    assets = FRONTEND_DIST / "assets"
    if assets.exists():
        app.mount("/assets", StaticFiles(directory=assets), name="assets")

    @app.get("/{full_path:path}")
    def spa(full_path: str):
        if full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="Not found")
        candidate = FRONTEND_DIST / full_path
        if full_path and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(FRONTEND_DIST / "index.html")
