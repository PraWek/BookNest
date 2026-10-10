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

export type Chapter = { title: string; text: string; format?: 'plain' | 'markdown' }
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

export type AppTheme = 'system' | 'light' | 'dark'
export type AppStyle = 'soft' | 'glass' | 'liquid' | 'minimal'
export type ResolvedTheme = 'light' | 'dark'
export type PageTheme = ReaderSettings['theme']
export type AppearancePreferences = ReaderSettings & {
  uiTheme?: AppTheme
  uiStyle?: AppStyle
  pageThemes?: Partial<Record<ResolvedTheme, PageTheme>>
}


export type TtsVoice = {
  id: string
  name: string
  language: string
  description: string
  gender: 'female' | 'male'
}

export type TtsWordBoundary = { start: number; duration: number; text: string }
export type TtsNarration = { audio: string; boundaries: TtsWordBoundary[] }
