import type { TtsWordBoundary } from './types'

type SpeechWord = { start: number; end: number; element: HTMLElement }
export type SpeechChunk = { text: string; words: SpeechWord[] }
export type TimedSpeechWord = TtsWordBoundary & { elements: HTMLElement[] }

const BLOCK_TAGS = new Set(['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'TR', 'TD', 'TH', 'BLOCKQUOTE', 'BR'])

// Use the rendered chapter: links, entities and inline formatting must match
// the spoken text, rather than offsets in the original Markdown source.
export function collectSpeechChunks(root: HTMLElement, maxLength = 1250, startElement?: HTMLElement | null, firstLength = maxLength, chunkLimit = Infinity): SpeechChunk[] {
  let text = ''
  const words: SpeechWord[] = []
  const append = (value: string, element?: HTMLElement) => {
    let clean = value.replace(/\s+/gu, ' ')
    if (text.endsWith(' ')) clean = clean.replace(/^ /u, '')
    const start = text.length
    text += clean
    if (element && clean.trim()) words.push({ start, end: text.length, element })
  }
  const visit = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) { append(node.textContent ?? ''); return }
    if (!(node instanceof HTMLElement)) return
    if (node.matches('pre, img, input, [aria-hidden="true"]')) return
    if (node.matches('.katex-display, .katex')) {
      append(' ')
      append('формула', node)
      append(' ')
      return
    }
    if (node.hasAttribute('data-speech-word')) { append(node.textContent ?? '', node); return }
    const block = BLOCK_TAGS.has(node.tagName)
    if (block) append(' ')
    node.childNodes.forEach(visit)
    if (block) append(' ')
  }
  root.querySelectorAll<HTMLElement>('[data-speech-content]').forEach((section, index) => {
    if (index) {
      text = text.trimEnd()
      append(/[.!?…]$/u.test(text) ? ' ' : '. ')
    }
    visit(section)
  })

  const chunks: SpeechChunk[] = []
  let start = 0
  if (startElement) {
    const firstWord = words.find((word) => word.element === startElement || word.element.contains(startElement) || startElement.contains(word.element))
    if (!firstWord) return []
    start = speechWordStart(text, firstWord.start)
  }
  let wordIndex = 0
  while (start < text.length && chunks.length < chunkLimit) {
    while (text[start] === ' ') start += 1
    if (start >= text.length) break
    const limit = chunks.length === 0 ? Math.min(firstLength, maxLength) : maxLength
    let end = Math.min(start + limit, text.length)
    if (end < text.length) {
      const space = text.lastIndexOf(' ', end)
      if (space > start) end = space
      const sentenceEnds = [...text.slice(start, end).matchAll(/[.!?…](?=\s)/gu)]
      const last = sentenceEnds.at(-1)
      if (last && last.index > limit / 2) end = start + last.index + 1
    }
    const chunkText = text.slice(start, end).trimEnd()
    const chunkEnd = start + chunkText.length
    while (wordIndex < words.length && words[wordIndex].end <= start) wordIndex += 1
    let wordEnd = wordIndex
    while (wordEnd < words.length && words[wordEnd].start < chunkEnd) wordEnd += 1
    chunks.push({
      text: chunkText,
      words: words.slice(wordIndex, wordEnd)
        .map((word) => ({ ...word, start: Math.max(0, word.start - start), end: Math.min(chunkText.length, word.end - start) }))
    })
    start = end
  }
  return chunks
}

// A word may cross inline Markdown elements; start at its first character.
export function speechWordStart(text: string, offset: number): number {
  let start = Math.max(0, Math.min(text.length, offset))
  while (start > 0 && !/\s/u.test(text[start - 1])) start -= 1
  return start
}

export function firstVisibleSpeechElement(root: HTMLElement): HTMLElement | null {
  const scroller = root.closest('.reading-scroll')
  const viewport = scroller?.getBoundingClientRect() ?? { top: 0, bottom: window.innerHeight, left: 0, right: window.innerWidth }
  return [...root.querySelectorAll<HTMLElement>('[data-speech-content] [data-speech-word], [data-speech-content] .katex')]
    .find((element) => [...element.getClientRects()].some((rect) =>
      rect.bottom > Math.max(0, viewport.top) && rect.top < Math.min(window.innerHeight, viewport.bottom) &&
      rect.right > Math.max(0, viewport.left) && rect.left < Math.min(window.innerWidth, viewport.right))) ?? null
}

export function alignSpeechBoundaries(chunk: SpeechChunk, boundaries: TtsWordBoundary[]): TimedSpeechWord[] {
  let cursor = 0
  return boundaries.map((boundary) => {
    const spoken = boundary.text.trim()
    let start = spoken ? chunk.text.indexOf(spoken, cursor) : -1
    if (start < 0 && spoken) start = chunk.text.toLocaleLowerCase().indexOf(spoken.toLocaleLowerCase(), cursor)
    if (start < 0) return { ...boundary, elements: [] }
    const end = start + spoken.length
    cursor = end
    return { ...boundary, elements: chunk.words.filter((word) => word.end > start && word.start < end).map((word) => word.element) }
  })
}

export function speechWordAt(words: TimedSpeechWord[], time: number): TimedSpeechWord | undefined {
  let low = 0
  let high = words.length - 1
  while (low <= high) {
    const middle = (low + high) >>> 1
    if (words[middle].start <= time) low = middle + 1
    else high = middle - 1
  }
  const word = words[high]
  return word && time < word.start + word.duration ? word : undefined
}

export function narrationBlob(base64: string): Blob {
  const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0))
  return new Blob([bytes], { type: 'audio/mpeg' })
}

export type BufferedNarration = { blob: Blob; boundaries: TtsWordBoundary[] }

// Reuse synthesis while opening the panel, starting playback and restarting.
// Bound memory to a small window rather than retaining an entire audiobook.
export class NarrationBuffer {
  private cache = new Map<string, BufferedNarration>()
  private pending = new Map<string, { controller: AbortController; promise: Promise<BufferedNarration> }>()
  private bytes = 0
  private fetchNarration: (text: string, voice: string, signal: AbortSignal) => Promise<{ audio: string; boundaries: TtsWordBoundary[] }>
  private maxBytes: number

  constructor(fetchNarration: (text: string, voice: string, signal: AbortSignal) => Promise<{ audio: string; boundaries: TtsWordBoundary[] }>, maxBytes = 12 * 1024 * 1024) {
    this.fetchNarration = fetchNarration
    this.maxBytes = maxBytes
  }

  load(text: string, voice: string): Promise<BufferedNarration> {
    const key = JSON.stringify([voice, text])
    const cached = this.cache.get(key)
    if (cached) {
      this.cache.delete(key)
      this.cache.set(key, cached)
      return Promise.resolve(cached)
    }
    const pending = this.pending.get(key)
    if (pending) return pending.promise
    const controller = new AbortController()
    const promise = this.fetchNarration(text, voice, controller.signal).then((result) => {
      controller.signal.throwIfAborted()
      const narration = { blob: narrationBlob(result.audio), boundaries: result.boundaries }
      if (narration.blob.size <= this.maxBytes) {
        this.cache.set(key, narration)
        this.bytes += narration.blob.size
        while (this.bytes > this.maxBytes || this.cache.size > 16) {
          const oldest = this.cache.keys().next().value!
          this.bytes -= this.cache.get(oldest)!.blob.size
          this.cache.delete(oldest)
        }
      }
      return narration
    }).finally(() => {
      if (this.pending.get(key)?.controller === controller) this.pending.delete(key)
    })
    // Speculative requests may fail before playback reaches them.
    void promise.catch(() => undefined)
    this.pending.set(key, { controller, promise })
    return promise
  }

  cancelPending() {
    this.pending.forEach(({ controller }) => controller.abort())
    this.pending.clear()
  }
}
