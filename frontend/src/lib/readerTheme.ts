import type { ReaderSettings } from './types'

export const READER_THEME_KEY = 'booknest-reader-theme'

export function storedReaderTheme(): ReaderSettings['theme'] {
  try {
    const saved = localStorage.getItem(READER_THEME_KEY)
    if (saved === 'paper' || saved === 'ivory' || saved === 'sepia' || saved === 'night' || saved === 'midnight') return saved
  } catch { /* Storage may be disabled. Use the current site theme. */ }
  return document.documentElement.dataset.resolvedTheme === 'dark' ? 'night' : 'paper'
}

export function saveReaderTheme(theme: ReaderSettings['theme']) {
  try { localStorage.setItem(READER_THEME_KEY, theme) } catch { /* Keep the in-memory preference. */ }
}
