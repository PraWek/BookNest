import type { Bookmark, BookDetail, BookSummary, ReaderSettings, TtsVoice, TtsNarration } from './types'

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options)
  if (!response.ok) {
    const payload = await response.json().catch(() => null)
    throw new Error(payload?.detail || `Ошибка ${response.status}`)
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export const api = {
  books: () => request<BookSummary[]>('/api/books'),
  book: (id: number) => request<BookDetail>(`/api/books/${id}`),
  upload: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return request<BookDetail>('/api/books/upload', { method: 'POST', body: form })
  },
  importUrl: (url: string) => request<BookDetail>('/api/books/import-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url })
  }),
  updateBook: (id: number, body: { title?: string; author?: string | null }) =>
    request<BookDetail>(`/api/books/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }),
  deleteBook: (id: number) => request<void>(`/api/books/${id}`, { method: 'DELETE' }),
  saveProgress: (id: number, chapter_index: number, scroll_percent: number) =>
    request(`/api/books/${id}/progress`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chapter_index, scroll_percent })
    }),
  bookmarks: (id: number) => request<Bookmark[]>(`/api/books/${id}/bookmarks`),
  addBookmark: (id: number, payload: Omit<Bookmark, 'id' | 'book_id' | 'created_at'>) =>
    request<Bookmark>(`/api/books/${id}/bookmarks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }),
  removeBookmark: (id: number) => request<void>(`/api/bookmarks/${id}`, { method: 'DELETE' }),
  preferences: () => request<{ settings: ReaderSettings }>('/api/preferences'),
  savePreferences: (settings: ReaderSettings) =>
    request<{ settings: ReaderSettings }>('/api/preferences', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings })
    }),
  ttsVoices: () => request<TtsVoice[]>('/api/tts/voices'),
  ttsNarration: (text: string, voice: string, rate: number, signal?: AbortSignal) =>
    request<TtsNarration>('/api/tts/narration', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voice, rate }),
      signal
    }),
  ttsAudio: async (text: string, voice: string, rate: number, signal?: AbortSignal) => {
    const response = await fetch('/api/tts/speech', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voice, rate }),
      signal
    })
    if (!response.ok) {
      const payload = await response.json().catch(() => null)
      throw new Error(payload?.detail || `Ошибка ${response.status}`)
    }
    return response.blob()
  }
}
