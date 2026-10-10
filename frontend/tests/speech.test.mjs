import assert from 'node:assert/strict'
import test from 'node:test'
import { alignSpeechBoundaries, collectSpeechChunks, NarrationBuffer, narrationBlob, speechWordAt, speechWordStart } from '../src/lib/speech.ts'

test('choosing part of a formatted word starts at the whole word', () => {
  assert.equal(speechWordStart('Глава. подсветка слов', 10), 7)
  assert.equal(speechWordStart('Глава. подсветка слов', 18), 17)
  assert.equal(speechWordStart('Слово', 0), 0)
})

test('repeated words map to their own occurrences, including punctuation', () => {
  const first = { id: 'first' }
  const second = { id: 'second' }
  const chunk = { text: 'Привет, привет!', words: [
    { start: 0, end: 7, element: first },
    { start: 8, end: 15, element: second },
  ] }
  const aligned = alignSpeechBoundaries(chunk, [
    { text: 'Привет', start: 0.1, duration: 0.4 },
    { text: 'привет', start: 0.7, duration: 0.4 },
  ])
  assert.deepEqual(aligned.map((word) => word.elements), [[first], [second]])
})

test('one spoken word can span several Markdown elements', () => {
  const elements = [{ id: 'prefix' }, { id: 'bold' }, { id: 'suffix' }]
  const aligned = alignSpeechBoundaries({ text: 'подсветка', words: [
    { start: 0, end: 2, element: elements[0] },
    { start: 2, end: 6, element: elements[1] },
    { start: 6, end: 9, element: elements[2] },
  ] }, [{ text: 'подсветка', start: 0, duration: 1 }])
  assert.deepEqual(aligned[0].elements, elements)
})

test('unmatched metadata never highlights unrelated text', () => {
  const element = { id: 'word' }
  const aligned = alignSpeechBoundaries({ text: 'Мир', words: [{ start: 0, end: 3, element }] }, [
    { text: 'unknown', start: 0, duration: 0.2 },
    { text: 'мир', start: 0.3, duration: 0.2 },
  ])
  assert.deepEqual(aligned[0].elements, [])
  assert.deepEqual(aligned[1].elements, [element])
})

test('playback time handles silence, word ends, seeks and completion', () => {
  const words = [
    { text: 'one', start: 0.1, duration: 0.3, elements: [] },
    { text: 'two', start: 0.7, duration: 0.4, elements: [] },
  ]
  assert.equal(speechWordAt(words, 0), undefined)
  assert.equal(speechWordAt(words, 0.1), words[0])
  assert.equal(speechWordAt(words, 0.25), words[0])
  assert.equal(speechWordAt(words, 0.4), undefined)
  assert.equal(speechWordAt(words, 0.7), words[1])
  assert.equal(speechWordAt(words, 10), undefined)
  assert.equal(speechWordAt(words, 0.2), words[0])
  assert.equal(speechWordAt([], 0), undefined)
})

test('Base64 audio retains its bytes and MIME type', async () => {
  const bytes = Buffer.from([0, 255, 12, 128])
  const blob = narrationBlob(bytes.toString('base64'))
  assert.equal(blob.type, 'audio/mpeg')
  assert.deepEqual(Buffer.from(await blob.arrayBuffer()), bytes)
})

const narration = (text) => ({ audio: Buffer.from(text).toString('base64'), boundaries: [{ text, start: 0, duration: 1 }] })

test('warmup, playback and restart reuse synthesis; voices have separate audio', async () => {
  let calls = 0
  let finish
  const buffer = new NarrationBuffer(async (text) => { calls++; await new Promise((resolve) => { finish = resolve }); return narration(text) })
  const warmup = buffer.load('hello', 'voice-a')
  assert.equal(buffer.load('hello', 'voice-a'), warmup)
  finish()
  const ready = await warmup
  assert.equal(await buffer.load('hello', 'voice-a'), ready)
  assert.equal(calls, 1)
  const otherVoice = buffer.load('hello', 'voice-b')
  finish()
  assert.notEqual(await otherVoice, ready)
  assert.equal(calls, 2)
})

test('failed speculative synthesis can be retried without an unhandled rejection', async () => {
  let calls = 0
  const buffer = new NarrationBuffer(async (text) => { if (++calls === 1) throw new Error('offline'); return narration(text) })
  await assert.rejects(buffer.load('hello', 'voice'), /offline/)
  assert.equal((await buffer.load('hello', 'voice')).blob.size, 5)
  assert.equal(calls, 2)
})

test('stop cancels all pending synthesis and a late result cannot replace a restart', async () => {
  const requests = []
  const buffer = new NarrationBuffer((text, voice, signal) => new Promise((resolve) => { requests.push({ signal, resolve, text }) }))
  const first = buffer.load('first', 'voice')
  const next = buffer.load('next', 'voice')
  buffer.cancelPending()
  assert.ok(requests.every((request) => request.signal.aborted))
  const restarted = buffer.load('first', 'voice')
  requests[0].resolve(narration('old'))
  requests[1].resolve(narration('old'))
  await assert.rejects(first, { name: 'AbortError' })
  await assert.rejects(next, { name: 'AbortError' })
  assert.equal(buffer.load('first', 'voice'), restarted)
  requests[2].resolve(narration('new'))
  assert.equal(await (await restarted).blob.text(), 'new')
})

test('audio cache evicts least recently used data within its byte budget', async () => {
  const calls = []
  const buffer = new NarrationBuffer(async (text) => { calls.push(text); return narration(text) }, 6)
  await buffer.load('one', 'voice')
  await buffer.load('two', 'voice')
  await buffer.load('one', 'voice')
  await buffer.load('six', 'voice')
  await buffer.load('one', 'voice')
  assert.deepEqual(calls, ['one', 'two', 'six'])
  await buffer.load('two', 'voice')
  assert.deepEqual(calls, ['one', 'two', 'six', 'two'])
})

test('a short opening chunk preserves all text and selected word offsets', () => {
  // Only the rendered DOM interface used by the collector is needed here.
  const oldElement = globalThis.HTMLElement
  const oldNode = globalThis.Node
  class Element {
    nodeType = 1
    tagName = 'SPAN'
    childNodes = []
    constructor(text, word = false) { this.textContent = text; this.word = word }
    matches() { return false }
    hasAttribute(name) { return name === 'data-speech-word' && this.word }
    contains(element) { return this === element }
  }
  globalThis.HTMLElement = Element
  globalThis.Node = { TEXT_NODE: 3 }
  try {
    const section = new Element('')
    const words = Array.from({ length: 80 }, (_, index) => new Element(`word${index}`, true))
    section.childNodes = words.flatMap((word) => [word, { nodeType: 3, textContent: ' ' }])
    const root = { querySelectorAll: () => [section] }
    const chunks = collectSpeechChunks(root, 125, null, 30)
    assert.deepEqual(collectSpeechChunks(root, 125, null, 30, 1), [chunks[0]])
    assert.ok(chunks[0].text.length <= 30)
    assert.ok(chunks[1].text.length > 30)
    assert.equal(chunks.map((chunk) => chunk.text).join(' '), words.map((word) => word.textContent).join(' '))
    const selected = collectSpeechChunks(root, 125, words[10], 30)
    assert.ok(selected[0].text.startsWith('word10 '))
    assert.equal(selected[0].words[0].element, words[10])
    assert.equal(selected[0].words[0].start, 0)
  } finally {
    globalThis.HTMLElement = oldElement
    globalThis.Node = oldNode
  }
})
