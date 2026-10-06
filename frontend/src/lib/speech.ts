import type { TtsWordBoundary } from './types'

type SpeechWord = { start: number; end: number; element: HTMLElement }
export type SpeechChunk = { text: string; words: SpeechWord[] }
export type TimedSpeechWord = TtsWordBoundary & { elements: HTMLElement[] }

const BLOCK_TAGS = new Set(['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'TR', 'TD', 'TH', 'BLOCKQUOTE', 'BR'])

// Use the rendered chapter: links, entities and inline formatting must match
// the spoken text, rather than offsets in the original Markdown source.
export function collectSpeechChunks(root: HTMLElement, maxLength = 1250): SpeechChunk[] {
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
  while (start < text.length) {
    while (text[start] === ' ') start += 1
    if (start >= text.length) break
    let end = Math.min(start + maxLength, text.length)
    if (end < text.length) {
      const space = text.lastIndexOf(' ', end)
      if (space > start) end = space
      const sentenceEnds = [...text.slice(start, end).matchAll(/[.!?…](?=\s)/gu)]
      const last = sentenceEnds.at(-1)
      if (last && last.index > maxLength / 2) end = start + last.index + 1
    }
    const chunkText = text.slice(start, end).trimEnd()
    const chunkEnd = start + chunkText.length
    chunks.push({
      text: chunkText,
      words: words.filter((word) => word.end > start && word.start < chunkEnd)
        .map((word) => ({ ...word, start: Math.max(0, word.start - start), end: Math.min(chunkText.length, word.end - start) }))
    })
    start = end
  }
  return chunks
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
