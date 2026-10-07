import assert from 'node:assert/strict'
import test from 'node:test'
import { alignSpeechBoundaries, narrationBlob, speechWordAt, speechWordStart } from '../src/lib/speech.ts'

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
