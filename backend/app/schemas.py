from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field, HttpUrl


class ChapterOut(BaseModel):
    title: str
    text: str


class ProgressOut(BaseModel):
    chapter_index: int = 0
    scroll_percent: float = 0.0
    updated_at: datetime | None = None


class BookSummary(BaseModel):
    id: int
    title: str
    author: str | None = None
    filename: str
    file_format: str
    total_chars: int
    chapter_count: int
    created_at: datetime
    updated_at: datetime
    progress: ProgressOut | None = None


class BookDetail(BookSummary):
    chapters: list[ChapterOut]


class BookPatch(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=500)
    author: str | None = Field(default=None, max_length=300)


class UrlImportIn(BaseModel):
    url: HttpUrl


class ProgressIn(BaseModel):
    chapter_index: int = Field(ge=0)
    scroll_percent: float = Field(ge=0, le=100)


class BookmarkIn(BaseModel):
    chapter_index: int = Field(ge=0)
    scroll_percent: float = Field(default=0, ge=0, le=100)
    label: str | None = Field(default=None, max_length=300)
    excerpt: str | None = Field(default=None, max_length=1000)


class BookmarkOut(BookmarkIn):
    model_config = ConfigDict(from_attributes=True)
    id: int
    book_id: int
    created_at: datetime


class PreferencesIn(BaseModel):
    settings: dict


class PreferencesOut(BaseModel):
    settings: dict
    updated_at: datetime | None = None
