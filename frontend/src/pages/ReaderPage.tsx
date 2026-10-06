import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft, Bookmark as BookmarkIcon, ChevronLeft, ChevronRight, Expand, List, Menu,
  Search, Settings2, Trash2, X, BookOpen, Clock3, Keyboard, Check, PanelLeftClose, Volume2, Minimize2
} from 'lucide-react'
import ReaderSettingsPanel from '../components/ReaderSettingsPanel'
import MarkdownChapter from '../components/MarkdownChapter'
import SpeechPanel from '../components/SpeechPanel'
import { api } from '../lib/api'
import type { Bookmark, BookDetail, ReaderSettings } from '../lib/types'
import { estimateMinutes, formatDuration, progressPercent, splitParagraphs } from '../lib/text'

const DEFAULT_SETTINGS: ReaderSettings = {
  theme: 'paper', fontFamily: 'literata', fontSize: 19, lineHeight: 1.75,
  contentWidth: 760, letterSpacing: 0, paragraphSpacing: 1, textAlign: 'left', focusMode: false
}

type SideTab = 'contents' | 'bookmarks' | 'search'

export default function ReaderPage() {
  const { bookId } = useParams()
  const id = Number(bookId)
  const navigate = useNavigate()
  const scrollerRef = useRef<HTMLDivElement>(null)
  const saveTimer = useRef<number | null>(null)
  const restored = useRef(false)

  const [book, setBook] = useState<BookDetail | null>(null)
  const [chapterIndex, setChapterIndex] = useState(0)
  const [scrollPercent, setScrollPercent] = useState(0)
  const [settings, setSettings] = useState<ReaderSettings>(DEFAULT_SETTINGS)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [sideOpen, setSideOpen] = useState(false)
  const [sideTab, setSideTab] = useState<SideTab>('contents')
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [savedPulse, setSavedPulse] = useState(false)
  const [speechOpen, setSpeechOpen] = useState(false)

  useEffect(() => {
    if (!Number.isFinite(id)) return
    Promise.all([api.book(id), api.preferences(), api.bookmarks(id)])
      .then(([loadedBook, prefs, marks]) => {
        setBook(loadedBook)
        setBookmarks(marks)
        setSettings({ ...DEFAULT_SETTINGS, ...prefs.settings })
        setChapterIndex(Math.min(loadedBook.progress?.chapter_index ?? 0, Math.max(0, loadedBook.chapters.length - 1)))
        setScrollPercent(loadedBook.progress?.scroll_percent ?? 0)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [id])

  useEffect(() => {
    if (!book || restored.current) return
    const node = scrollerRef.current
    if (!node) return
    requestAnimationFrame(() => {
      const max = node.scrollHeight - node.clientHeight
      node.scrollTop = max > 0 ? max * ((book.progress?.scroll_percent ?? 0) / 100) : 0
      restored.current = true
    })
  }, [book, chapterIndex])

  useEffect(() => {
    if (loading) return
    const timer = window.setTimeout(() => api.savePreferences(settings).catch(() => undefined), 450)
    return () => clearTimeout(timer)
  }, [settings, loading])

  const persistProgress = useCallback((chapter = chapterIndex, percent = scrollPercent) => {
    if (!book) return
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => {
      api.saveProgress(book.id, chapter, percent).then(() => {
        setSavedPulse(true)
        window.setTimeout(() => setSavedPulse(false), 1200)
      }).catch(() => undefined)
    }, 350)
  }, [book, chapterIndex, scrollPercent])

  const handleScroll = () => {
    const node = scrollerRef.current
    if (!node) return
    const max = node.scrollHeight - node.clientHeight
    const pct = max <= 0 ? 100 : (node.scrollTop / max) * 100
    setScrollPercent(pct)
    persistProgress(chapterIndex, pct)
  }

  const changeChapter = useCallback((next: number, targetPercent = 0) => {
    if (!book || next < 0 || next >= book.chapters.length) return
    api.saveProgress(book.id, next, targetPercent).catch(() => undefined)
    setChapterIndex(next)
    setScrollPercent(targetPercent)
    restored.current = true
    requestAnimationFrame(() => {
      const node = scrollerRef.current
      if (!node) return
      const max = node.scrollHeight - node.clientHeight
      node.scrollTop = targetPercent ? max * (targetPercent / 100) : 0
    })
    if (window.innerWidth < 900) setSideOpen(false)
  }, [book])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA') return
      if (e.key === 'ArrowLeft') changeChapter(chapterIndex - 1)
      if (e.key === 'ArrowRight') changeChapter(chapterIndex + 1)
      if (e.key.toLowerCase() === 'f') setSettings((s) => ({ ...s, focusMode: !s.focusMode }))
      if (e.key === '+' || e.key === '=') setSettings((s) => ({ ...s, fontSize: Math.min(34, s.fontSize + 1) }))
      if (e.key === '-') setSettings((s) => ({ ...s, fontSize: Math.max(14, s.fontSize - 1) }))
      if (e.key === 'Escape') {
        setSettingsOpen(false)
        setSideOpen(false)
        setSpeechOpen(false)
        setSettings((s) => s.focusMode ? { ...s, focusMode: false } : s)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [changeChapter, chapterIndex])

  const overall = book ? progressPercent(chapterIndex, book.chapters.length, scrollPercent) : 0
  const chapter = book?.chapters[chapterIndex]
  const chapterMinutes = chapter ? estimateMinutes(chapter.text.length) : 0
  const paragraphs = useMemo(() => splitParagraphs(chapter?.text ?? ''), [chapter])

  const searchResults = useMemo(() => {
    if (!book || searchQuery.trim().length < 2) return []
    const q = searchQuery.toLocaleLowerCase('ru')
    return book.chapters.flatMap((c, index) => {
      const hay = `${c.title}\n${c.text}`.toLocaleLowerCase('ru')
      const at = hay.indexOf(q)
      if (at < 0) return []
      const start = Math.max(0, at - 80)
      const end = Math.min(c.text.length, at + q.length + 140)
      return [{ index, title: c.title, excerpt: c.text.slice(start, end).replace(/\s+/g, ' ') }]
    }).slice(0, 30)
  }, [book, searchQuery])

  const addBookmark = async () => {
    if (!book || !chapter) return
    const mark = await api.addBookmark(book.id, {
      chapter_index: chapterIndex,
      scroll_percent: scrollPercent,
      label: chapter.title,
      excerpt: chapter.text.slice(0, 180).replace(/\s+/g, ' ')
    })
    setBookmarks((prev) => [mark, ...prev])
  }

  if (loading) return <div className="reader-loading"><div className="brand-mark"><BookOpen size={20} /></div><span className="spinner large" /></div>
  if (error || !book || !chapter) return (
    <div className="reader-error"><BookOpen size={34} /><h2>Не удалось открыть книгу</h2><p>{error || 'Книга не найдена'}</p><button className="btn primary" onClick={() => navigate('/')}>В библиотеку</button></div>
  )

  const readerVars = {
    '--reader-font-size': `${settings.fontSize}px`,
    '--reader-line-height': settings.lineHeight,
    '--reader-width': `${settings.contentWidth}px`,
    '--reader-letter-spacing': `${settings.letterSpacing}px`,
    '--reader-paragraph-spacing': `${settings.paragraphSpacing}em`,
  } as React.CSSProperties

  return (
    <div className={`reader-shell theme-${settings.theme} font-${settings.fontFamily} ${settings.focusMode ? 'focus-mode' : ''}`} style={readerVars}>
      <div className="reader-progress-top"><i style={{ width: `${overall}%` }} /></div>

      {settings.focusMode && (
        <button className="focus-exit" onClick={() => setSettings((s) => ({ ...s, focusMode: false }))} title="Выйти из режима фокусировки (F или Esc)">
          <Minimize2 size={15} /><span>Выйти из фокуса</span><kbd>F</kbd>
        </button>
      )}

      <header className="reader-topbar">
        <div className="reader-top-left">
          <button className="icon-btn reader-back" onClick={() => navigate('/')} title="В библиотеку"><ArrowLeft size={19} /></button>
          <button className="icon-btn mobile-only" onClick={() => setSideOpen(true)} title="Оглавление"><Menu size={19} /></button>
          <div className="reader-title-block"><strong>{book.title}</strong><span>{chapter.title}</span></div>
        </div>
        <div className="reader-top-center"><span>{Math.round(overall)}%</span><i />{savedPulse ? <span className="save-state"><Check size={12} /> сохранено</span> : <span>глава {chapterIndex + 1} из {book.chapters.length}</span>}</div>
        <div className="reader-actions">
          <button className={`icon-btn ${speechOpen ? 'active' : ''}`} onClick={() => { setSpeechOpen(!speechOpen); setSettingsOpen(false) }} title="Озвучить текст"><Volume2 size={18} /></button>
          <button className="icon-btn" onClick={addBookmark} title="Добавить закладку"><BookmarkIcon size={18} /></button>
          <button className="icon-btn desktop-only" onClick={() => document.documentElement.requestFullscreen?.()} title="На весь экран"><Expand size={18} /></button>
          <button className={`icon-btn ${settingsOpen ? 'active' : ''}`} onClick={() => setSettingsOpen(!settingsOpen)} title="Настройки"><Settings2 size={18} /></button>
        </div>
      </header>

      <div className="reader-body">
        <aside className={`reader-panel nav-panel ${sideOpen ? 'open' : ''}`}>
          <div className="panel-head nav-head">
            <div className="reader-brand"><span className="brand-mark tiny"><BookOpen size={15} /></span><span>BookNest</span></div>
            <button className="icon-btn" onClick={() => setSideOpen(false)}><PanelLeftClose size={18} /></button>
          </div>
          <div className="side-tabs">
            <button className={sideTab === 'contents' ? 'active' : ''} onClick={() => setSideTab('contents')} title="Оглавление"><List size={16} /><span>Содержание</span></button>
            <button className={sideTab === 'bookmarks' ? 'active' : ''} onClick={() => setSideTab('bookmarks')} title="Закладки"><BookmarkIcon size={16} /><span>Закладки</span></button>
            <button className={sideTab === 'search' ? 'active' : ''} onClick={() => setSideTab('search')} title="Поиск"><Search size={16} /><span>Поиск</span></button>
          </div>
          <div className="side-content">
            {sideTab === 'contents' && (
              <>
                <div className="side-book-meta"><h2>{book.title}</h2>{book.author && <p>{book.author}</p>}<span>{formatDuration(estimateMinutes(book.total_chars))} · {book.chapters.length} разделов</span></div>
                <nav className="chapter-list">
                  {book.chapters.map((c, index) => <button key={`${c.title}-${index}`} className={chapterIndex === index ? 'active' : ''} onClick={() => changeChapter(index)}><span>{String(index + 1).padStart(2, '0')}</span><strong>{c.title}</strong></button>)}
                </nav>
              </>
            )}
            {sideTab === 'bookmarks' && (
              bookmarks.length ? <div className="bookmark-list">{bookmarks.map((mark) => (
                <div className="bookmark-item" key={mark.id}>
                  <button className="bookmark-main" onClick={() => changeChapter(mark.chapter_index, mark.scroll_percent)}><span>Глава {mark.chapter_index + 1} · {Math.round(mark.scroll_percent)}%</span><strong>{mark.label || book.chapters[mark.chapter_index]?.title}</strong>{mark.excerpt && <p>{mark.excerpt}</p>}</button>
                  <button className="bookmark-delete" onClick={async () => { await api.removeBookmark(mark.id); setBookmarks((prev) => prev.filter((b) => b.id !== mark.id)) }}><Trash2 size={14} /></button>
                </div>
              ))}</div> : <div className="panel-empty"><BookmarkIcon size={24} /><strong>Закладок пока нет</strong><span>Добавляйте их кнопкой в верхней панели.</span></div>
            )}
            {sideTab === 'search' && (
              <div className="book-search">
                <div className="search-field small"><Search size={16} /><input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} autoFocus placeholder="Поиск по книге" />{searchQuery && <button onClick={() => setSearchQuery('')}><X size={14} /></button>}</div>
                {searchQuery.length >= 2 && <span className="search-count">Найдено: {searchResults.length}</span>}
                <div className="search-results">{searchResults.map((r) => <button key={r.index} onClick={() => changeChapter(r.index)}><strong>{r.title}</strong><p>…{r.excerpt}…</p></button>)}</div>
              </div>
            )}
          </div>
          <div className="shortcuts-hint"><Keyboard size={15} /><span>← → главы &nbsp; F фокус &nbsp; +/- текст</span></div>
        </aside>

        <button className="side-rail desktop-only" onClick={() => setSideOpen(!sideOpen)} title="Оглавление"><List size={18} /></button>

        <main className="reading-scroll" ref={scrollerRef} onScroll={handleScroll}>
          <article className="reading-page">
            <div className="chapter-kicker">Раздел {chapterIndex + 1}</div>
            <h1>{chapter.title}</h1>
            <div className="chapter-meta"><span><Clock3 size={14} /> ~{formatDuration(chapterMinutes)}</span><span>{chapter.text.length.toLocaleString('ru-RU')} знаков</span></div>
            <div className={`chapter-text align-${settings.textAlign} ${chapter.format === 'markdown' ? 'is-markdown' : 'is-plain'}`}>
              {chapter.format === 'markdown' ? (
                <MarkdownChapter source={chapter.text} />
              ) : (
                paragraphs.map((paragraph, i) => {
                  const isSubhead = paragraph.length < 90 && (paragraph === paragraph.toUpperCase() || /^(глава|часть|chapter|part)\b/i.test(paragraph))
                  return isSubhead ? <h2 key={i}>{paragraph}</h2> : <p key={i}>{paragraph}</p>
                })
              )}
            </div>

            <div className="chapter-end">
              <span>Конец раздела</span>
              <div className="chapter-nav-buttons">
                <button className="btn ghost" disabled={chapterIndex === 0} onClick={() => changeChapter(chapterIndex - 1)}><ChevronLeft size={17} /> Назад</button>
                <button className="btn primary" disabled={chapterIndex === book.chapters.length - 1} onClick={() => changeChapter(chapterIndex + 1)}>Следующий раздел <ChevronRight size={17} /></button>
              </div>
            </div>
          </article>
        </main>
      </div>

      <ReaderSettingsPanel open={settingsOpen} settings={settings} onChange={setSettings} onClose={() => setSettingsOpen(false)} />
      <SpeechPanel open={speechOpen} title={chapter.title} text={chapter.text} onClose={() => setSpeechOpen(false)} />

      <nav className="reader-mobile-nav mobile-only">
        <button onClick={() => { setSideTab('contents'); setSideOpen(true) }}><List size={18} /><span>Главы</span></button>
        <button onClick={addBookmark}><BookmarkIcon size={18} /><span>Закладка</span></button>
        <button onClick={() => setSpeechOpen(true)}><Volume2 size={18} /><span>Диктор</span></button>
        <button onClick={() => { setSideTab('search'); setSideOpen(true) }}><Search size={18} /><span>Поиск</span></button>
        <button onClick={() => setSettingsOpen(true)}><Settings2 size={18} /><span>Текст</span></button>
      </nav>

      {(sideOpen || settingsOpen || speechOpen) && <button className="panel-scrim" onClick={() => { setSideOpen(false); setSettingsOpen(false); setSpeechOpen(false) }} aria-label="Закрыть панель" />}
    </div>
  )
}
