import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BookOpen, Clock3, Grid2X2, Library, MoreHorizontal, Plus, Search, SlidersHorizontal, Trash2, Pencil, X } from 'lucide-react'
import AppearanceControl from '../components/AppearanceControl'
import UploadModal from '../components/UploadModal'
import { api } from '../lib/api'
import type { BookSummary } from '../lib/types'
import { estimateMinutes, formatDuration, progressPercent } from '../lib/text'

export default function LibraryPage() {
  const navigate = useNavigate()
  const [books, setBooks] = useState<BookSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<'recent' | 'title' | 'progress'>('recent')
  const [editing, setEditing] = useState<BookSummary | null>(null)
  const [menu, setMenu] = useState<number | null>(null)
  const [error, setError] = useState('')

  const load = () => api.books().then(setBooks).catch((e) => setError(e.message)).finally(() => setLoading(false))
  useEffect(() => { load() }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = books.filter((b) => !q || `${b.title} ${b.author ?? ''}`.toLowerCase().includes(q))
    return [...list].sort((a, b) => {
      if (sort === 'title') return a.title.localeCompare(b.title, 'ru')
      if (sort === 'progress') {
        const pa = progressPercent(a.progress?.chapter_index ?? 0, a.chapter_count, a.progress?.scroll_percent ?? 0)
        const pb = progressPercent(b.progress?.chapter_index ?? 0, b.chapter_count, b.progress?.scroll_percent ?? 0)
        return pb - pa
      }
      return +new Date(b.updated_at) - +new Date(a.updated_at)
    })
  }, [books, query, sort])

  const upload = async (file: File) => {
    const book = await api.upload(file)
    setBooks((prev) => [book, ...prev])
    navigate(`/read/${book.id}`)
  }

  const importUrl = async (url: string) => {
    const book = await api.importUrl(url)
    setBooks((prev) => [book, ...prev])
    navigate(`/read/${book.id}`)
  }

  const remove = async (book: BookSummary) => {
    setMenu(null)
    await api.deleteBook(book.id)
    setBooks((prev) => prev.filter((b) => b.id !== book.id))
  }

  return (
    <div className="library-shell">
      <header className="site-header">
        <a className="brand" href="/" aria-label="BookNest">
          <span className="brand-mark"><BookOpen size={20} /></span>
          <span>BookNest</span>
        </a>
        <div className="header-actions">
          <AppearanceControl compact />
          <button className="btn primary compact" onClick={() => setUploadOpen(true)}><Plus size={17} /> Добавить книгу</button>
        </div>
      </header>

      <main className="library-main">
        <section className="library-hero">
          <div>
            <span className="eyebrow">Личная библиотека</span>
            <h1>Читайте без лишнего шума.</h1>
            <p>Загрузите книгу, настройте страницу под себя — и продолжайте с того же места на любом экране.</p>
          </div>
          <div className="hero-stat">
            <strong>{books.length}</strong>
            <span>{bookWord(books.length)}</span>
          </div>
        </section>

        <section className="library-toolbar">
          <div className="search-field"><Search size={17} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Название или автор" /></div>
          <div className="sort-wrap">
            <SlidersHorizontal size={16} />
            <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
              <option value="recent">Недавно открытые</option>
              <option value="title">По названию</option>
              <option value="progress">По прогрессу</option>
            </select>
          </div>
        </section>

        {error && <div className="page-error">{error}</div>}

        {loading ? (
          <div className="book-grid">{Array.from({ length: 4 }).map((_, i) => <div className="book-card skeleton" key={i} />)}</div>
        ) : filtered.length ? (
          <div className="book-grid">
            {filtered.map((book) => {
              const progress = progressPercent(book.progress?.chapter_index ?? 0, book.chapter_count, book.progress?.scroll_percent ?? 0)
              return (
                <article className="book-card" key={book.id} onClick={() => navigate(`/read/${book.id}`)}>
                  <div className={`book-cover cover-${book.id % 6}`}>
                    <span className="cover-format">{book.file_format.toUpperCase()}</span>
                    <div className="cover-title"><strong>{book.title}</strong>{book.author && <span>{book.author}</span>}</div>
                    <BookOpen size={22} className="cover-icon" />
                  </div>
                  <div className="book-meta">
                    <div className="book-card-title-row">
                      <div><h3>{book.title}</h3><p>{book.author || 'Автор не указан'}</p></div>
                      <button className="card-menu-btn" onClick={(e) => { e.stopPropagation(); setMenu(menu === book.id ? null : book.id) }}><MoreHorizontal size={19} /></button>
                      {menu === book.id && (
                        <div className="card-menu" onClick={(e) => e.stopPropagation()}>
                          <button onClick={() => { setEditing(book); setMenu(null) }}><Pencil size={15} /> Изменить</button>
                          <button className="danger" onClick={() => remove(book)}><Trash2 size={15} /> Удалить</button>
                        </div>
                      )}
                    </div>
                    <div className="book-facts"><span><Library size={14} /> {book.chapter_count} гл.</span><span><Clock3 size={14} /> {formatDuration(estimateMinutes(book.total_chars))}</span></div>
                    <div className="book-progress-row"><div className="progress-track"><i style={{ width: `${progress}%` }} /></div><span>{Math.round(progress)}%</span></div>
                  </div>
                </article>
              )
            })}
          </div>
        ) : books.length ? (
          <div className="empty-state"><Search size={30} /><h2>Ничего не найдено</h2><p>Попробуйте изменить запрос.</p></div>
        ) : (
          <div className="empty-state large">
            <div className="empty-illustration"><Grid2X2 size={30} /></div>
            <h2>Ваша библиотека пока пуста</h2>
            <p>Добавьте TXT, Markdown, EPUB, DOCX или PDF. Мы разобьём текст на разделы и подготовим его для чтения.</p>
            <button className="btn primary" onClick={() => setUploadOpen(true)}><Plus size={17} /> Загрузить первую книгу</button>
          </div>
        )}
      </main>

      <UploadModal open={uploadOpen} onClose={() => setUploadOpen(false)} onUpload={upload} onImportUrl={importUrl} />
      {editing && <EditBookModal book={editing} onClose={() => setEditing(null)} onSaved={(updated) => { setBooks((prev) => prev.map((b) => b.id === updated.id ? updated : b)); setEditing(null) }} />}
    </div>
  )
}

function EditBookModal({ book, onClose, onSaved }: { book: BookSummary; onClose: () => void; onSaved: (book: BookSummary) => void }) {
  const [title, setTitle] = useState(book.title)
  const [author, setAuthor] = useState(book.author ?? '')
  const [busy, setBusy] = useState(false)
  const save = async () => {
    if (!title.trim()) return
    setBusy(true)
    try { onSaved(await api.updateBook(book.id, { title: title.trim(), author: author.trim() })) } finally { setBusy(false) }
  }
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <section className="modal-card edit-modal">
        <div className="modal-head"><div><span className="eyebrow">Метаданные</span><h2>Изменить книгу</h2></div><button className="icon-btn" onClick={onClose}><X size={18} /></button></div>
        <label className="form-field"><span>Название</span><input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus /></label>
        <label className="form-field"><span>Автор</span><input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Не указан" /></label>
        <div className="modal-actions"><button className="btn ghost" onClick={onClose}>Отмена</button><button className="btn primary" disabled={busy || !title.trim()} onClick={save}>{busy ? 'Сохраняем…' : 'Сохранить'}</button></div>
      </section>
    </div>
  )
}

function bookWord(count: number) {
  const n10 = count % 10, n100 = count % 100
  if (n10 === 1 && n100 !== 11) return 'книга'
  if (n10 >= 2 && n10 <= 4 && !(n100 >= 12 && n100 <= 14)) return 'книги'
  return 'книг'
}
