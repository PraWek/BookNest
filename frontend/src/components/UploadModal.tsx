import { useRef, useState } from 'react'
import { CheckCircle2, FileText, Link2, UploadCloud, X } from 'lucide-react'

const ACCEPT = '.txt,.md,.markdown,.epub,.docx,.pdf'

type ImportMode = 'file' | 'url'

export default function UploadModal({
  open,
  onClose,
  onUpload,
  onImportUrl,
}: {
  open: boolean
  onClose: () => void
  onUpload: (file: File) => Promise<void>
  onImportUrl: (url: string) => Promise<void>
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [mode, setMode] = useState<ImportMode>('file')
  const [dragging, setDragging] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  if (!open) return null

  const choose = (selected?: File) => {
    if (!selected) return
    setError('')
    setFile(selected)
  }

  const close = () => {
    if (busy) return
    setError('')
    onClose()
  }

  const submit = async () => {
    if (mode === 'file' && !file) return
    if (mode === 'url' && !url.trim()) return
    setBusy(true)
    setError('')
    try {
      if (mode === 'file') await onUpload(file!)
      else await onImportUrl(url.trim())
      setFile(null)
      setUrl('')
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось добавить книгу')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <section className="modal-card upload-modal" role="dialog" aria-modal="true" aria-label="Добавить книгу">
        <div className="modal-head">
          <div>
            <span className="eyebrow">Импорт</span>
            <h2>Добавить книгу</h2>
          </div>
          <button className="icon-btn" onClick={close} aria-label="Закрыть"><X size={18} /></button>
        </div>

        <div className="import-tabs">
          <button className={mode === 'file' ? 'active' : ''} onClick={() => { setMode('file'); setError('') }}><UploadCloud size={16} /> С устройства</button>
          <button className={mode === 'url' ? 'active' : ''} onClick={() => { setMode('url'); setError('') }}><Link2 size={16} /> По ссылке</button>
        </div>

        {mode === 'file' ? (
          <>
            <div
              className={`dropzone ${dragging ? 'is-dragging' : ''} ${file ? 'has-file' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => { e.preventDefault(); setDragging(false); choose(e.dataTransfer.files[0]) }}
              onClick={() => inputRef.current?.click()}
            >
              <input ref={inputRef} hidden type="file" accept={ACCEPT} onChange={(e) => choose(e.target.files?.[0])} />
              {file ? (
                <>
                  <div className="drop-icon success"><CheckCircle2 size={24} /></div>
                  <strong>{file.name}</strong>
                  <span>{(file.size / 1024 / 1024).toFixed(2)} МБ · нажмите, чтобы заменить</span>
                </>
              ) : (
                <>
                  <div className="drop-icon"><UploadCloud size={24} /></div>
                  <strong>Перетащите файл сюда</strong>
                  <span>или нажмите, чтобы выбрать на устройстве</span>
                </>
              )}
            </div>
            <div className="format-row">
              {['TXT', 'MD', 'EPUB', 'DOCX', 'PDF'].map((f) => <span key={f}><FileText size={13} /> {f}</span>)}
            </div>
          </>
        ) : (
          <div className="url-import-card">
            <div className="url-import-icon"><Link2 size={23} /></div>
            <div>
              <strong>Ссылка на книгу или текст</strong>
              <p>Вставьте прямую ссылку на TXT, Markdown, EPUB, DOCX, PDF или веб-страницу с текстом книги.</p>
            </div>
            <label className="url-field">
              <span>URL</span>
              <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://lib.ru/.../book.txt" autoFocus inputMode="url" />
            </label>
            <div className="url-example">Например: <code>https://lib.ru/INPROZ/KAMU/postoronnij.txt</code></div>
          </div>
        )}

        {error && <div className="inline-error">{error}</div>}

        <div className="modal-actions">
          <button className="btn ghost" onClick={close}>Отмена</button>
          <button className="btn primary" disabled={(mode === 'file' ? !file : !url.trim()) || busy} onClick={submit}>
            {busy ? <><span className="spinner" /> {mode === 'url' ? 'Загружаем…' : 'Обрабатываем…'}</> : (mode === 'url' ? 'Импортировать по ссылке' : 'Добавить в библиотеку')}
          </button>
        </div>
      </section>
    </div>
  )
}
