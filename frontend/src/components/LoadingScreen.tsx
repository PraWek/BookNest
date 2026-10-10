import type { ReaderSettings } from '../lib/types'

export default function LoadingScreen({ readerTheme }: { readerTheme?: ReaderSettings['theme'] }) {
  return (
    <div className={`app-loading ${readerTheme ? `reader-loading theme-${readerTheme}` : ''}`} role="status" aria-live="polite">
      <span className="loading-spinner" aria-hidden="true" />
      <span>Загружаю книгу…</span>
    </div>
  )
}
