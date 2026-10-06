export type Progress = {
  chapter_index: number
  scroll_percent: number
  updated_at?: string | null
}

export type BookSummary = {
  id: number
  title: string
  author?: string | null
  filename: string
  file_format: string
  total_chars: number
  chapter_count: number
  created_at: string
  updated_at: string
  progress?: Progress | null
}

export type Chapter = { title: string; text: string }
export type BookDetail = BookSummary & { chapters: Chapter[] }

export type Bookmark = {
  id: number
  book_id: number
  chapter_index: number
  scroll_percent: number
  label?: string | null
  excerpt?: string | null
  created_at: string
}

export type ReaderSettings = {
  theme: 'paper' | 'ivory' | 'sepia' | 'night' | 'midnight'
  fontFamily: 'literata' | 'georgia' | 'sans' | 'humanist' | 'mono'
  fontSize: number
  lineHeight: number
  contentWidth: number
  letterSpacing: number
  paragraphSpacing: number
  textAlign: 'left' | 'justify'
  focusMode: boolean
}
