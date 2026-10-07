import { Pause, Play, RotateCcw, Sparkles, Volume2, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { api } from '../lib/api'
import { alignSpeechBoundaries, collectSpeechChunks, firstVisibleSpeechElement, narrationBlob, speechWordAt } from '../lib/speech'
import type { TimedSpeechWord } from '../lib/speech'
import type { TtsVoice } from '../lib/types'

type SpeechStatus = 'idle' | 'loading' | 'speaking' | 'paused'
type StartMode = 'beginning' | 'visible' | 'selected'

export default function SpeechPanel({ open, title, contentRef, onClose, onOpen, onPickStart }: {
  open: boolean
  title: string
  contentRef: RefObject<HTMLElement | null>
  onClose: () => void
  onOpen: () => void
  onPickStart: () => void
}) {
  const [voices, setVoices] = useState<TtsVoice[]>([])
  const [voiceId, setVoiceId] = useState(() => localStorage.getItem('booknest-neural-voice') || 'ru-RU-SvetlanaNeural')
  const [rate, setRate] = useState(() => {
    const saved = Number(localStorage.getItem('booknest-tts-rate') || '1')
    return Number.isFinite(saved) ? Math.max(0.7, Math.min(1.35, saved)) : 1
  })
  const [highlightEnabled, setHighlightEnabled] = useState(() => localStorage.getItem('booknest-tts-highlight') !== 'false')
  const [status, setStatus] = useState<SpeechStatus>('idle')
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')
  const [previewing, setPreviewing] = useState(false)
  const [startMode, setStartMode] = useState<StartMode>('beginning')
  const [startElement, setStartElement] = useState<HTMLElement | null>(null)
  const [startExcerpt, setStartExcerpt] = useState('')
  const [picking, setPicking] = useState(false)

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const objectUrlRef = useRef<string | null>(null)
  const finishCurrentRef = useRef<(() => void) | null>(null)
  const runRef = useRef(0)
  const frameRef = useRef<number | null>(null)
  const wordsRef = useRef<TimedSpeechWord[]>([])
  const highlightedRef = useRef<HTMLElement[]>([])
  const highlightEnabledRef = useRef(highlightEnabled)
  const rateRef = useRef(rate)

  const selectedVoice = voices.find((voice) => voice.id === voiceId) || voices[0]

  useEffect(() => {
    const controller = new AbortController()
    api.ttsVoices()
      .then((items) => {
        if (controller.signal.aborted) return
        setVoices(items)
        if (items.length && !items.some((voice) => voice.id === voiceId)) setVoiceId(items[0].id)
      })
      .catch((e) => { if (!controller.signal.aborted) setError(e.message) })
    return () => controller.abort()
  }, [])

  useEffect(() => {
    localStorage.setItem('booknest-tts-rate', String(rate))
    rateRef.current = rate
    if (audioRef.current) audioRef.current.playbackRate = rate
  }, [rate])
  useEffect(() => { localStorage.setItem('booknest-neural-voice', voiceId) }, [voiceId])
  useEffect(() => {
    localStorage.setItem('booknest-tts-highlight', String(highlightEnabled))
    highlightEnabledRef.current = highlightEnabled
    syncHighlight()
  }, [highlightEnabled])

  const setHighlighted = (elements: HTMLElement[]) => {
    if (elements.length === highlightedRef.current.length && elements.every((element, index) => element === highlightedRef.current[index])) return
    highlightedRef.current.forEach((element) => element.classList.remove('speech-word-active'))
    elements.forEach((element) => element.classList.add('speech-word-active'))
    highlightedRef.current = elements
  }

  const syncHighlight = () => {
    const audio = audioRef.current
    const word = audio && !audio.ended && highlightEnabledRef.current ? speechWordAt(wordsRef.current, audio.currentTime) : undefined
    setHighlighted(word?.elements ?? [])
  }

  const cancelFrame = () => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
    frameRef.current = null
  }

  const followAudio = () => {
    cancelFrame()
    const tick = () => {
      syncHighlight()
      const audio = audioRef.current
      if (audio && !audio.paused && !audio.ended) frameRef.current = requestAnimationFrame(tick)
      else frameRef.current = null
    }
    tick()
  }

  const clearAudio = () => {
    cancelFrame()
    wordsRef.current = []
    setHighlighted([])
    const audio = audioRef.current
    if (audio) {
      audio.onplaying = audio.onpause = audio.ontimeupdate = audio.onseeked = audio.onended = audio.onerror = null
      audio.pause()
      audio.removeAttribute('src')
      audio.load()
      audioRef.current = null
    }
    finishCurrentRef.current?.()
    finishCurrentRef.current = null
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current)
      objectUrlRef.current = null
    }
  }

  const cancelPlayback = () => {
    runRef.current += 1
    abortRef.current?.abort()
    abortRef.current = null
    clearAudio()
  }

  const stop = () => {
    cancelPlayback()
    setStatus('idle')
    setProgress(0)
    setPreviewing(false)
  }

  useEffect(() => () => cancelPlayback(), [])

  useEffect(() => {
    const root = contentRef.current
    if (!picking || !root) return
    root.classList.add('speech-picking')
    const elements = [...root.querySelectorAll<HTMLElement>('[data-speech-content] [data-speech-word], [data-speech-content] .katex')]
    const previousTabIndices = elements.map((element) => element.getAttribute('tabindex'))
    elements.forEach((element) => element.setAttribute('tabindex', '0'))
    firstVisibleSpeechElement(root)?.focus({ preventScroll: true })

    const choose = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent && event.key !== 'Enter' && event.key !== ' ') return
      const element = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-speech-word], .katex') : null
      if (!element || !root.contains(element)) return
      const chunks = collectSpeechChunks(root, 1250, element)
      if (!chunks.length) return
      event.preventDefault()
      event.stopPropagation()
      setStartElement(element)
      setStartExcerpt(chunks[0].text.slice(0, 110))
      setStartMode('selected')
      setPicking(false)
      onOpen()
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      setPicking(false)
      onOpen()
    }
    root.addEventListener('click', choose, true)
    root.addEventListener('keydown', choose, true)
    document.addEventListener('keydown', escape, true)
    return () => {
      root.classList.remove('speech-picking')
      elements.forEach((element, index) => {
        const previous = previousTabIndices[index]
        if (previous === null) element.removeAttribute('tabindex')
        else element.setAttribute('tabindex', previous)
      })
      root.removeEventListener('click', choose, true)
      root.removeEventListener('keydown', choose, true)
      document.removeEventListener('keydown', escape, true)
    }
  }, [picking, contentRef, onOpen])

  const playBlob = async (blob: Blob, token: number, words: TimedSpeechWord[] = [], onProgress?: (fraction: number) => void) => {
    if (token !== runRef.current) return
    clearAudio()
    wordsRef.current = words
    const url = URL.createObjectURL(blob)
    objectUrlRef.current = url
    const audio = new Audio(url)
    audio.playbackRate = rateRef.current
    audio.preservesPitch = true
    audioRef.current = audio
    await new Promise<void>((resolve, reject) => {
      finishCurrentRef.current = resolve
      audio.onplaying = followAudio
      audio.onpause = () => { cancelFrame(); syncHighlight() }
      audio.onseeked = syncHighlight
      audio.ontimeupdate = () => {
        syncHighlight()
        if (Number.isFinite(audio.duration) && audio.duration > 0) onProgress?.(audio.currentTime / audio.duration)
      }
      audio.onended = () => { cancelFrame(); setHighlighted([]); finishCurrentRef.current = null; resolve() }
      audio.onerror = () => { finishCurrentRef.current = null; reject(new Error('Не удалось воспроизвести аудио')) }
      audio.play().catch(reject)
    })
    if (token === runRef.current) clearAudio()
  }

  const start = async () => {
    if (!selectedVoice || !contentRef.current) return
    const from = startMode === 'visible' ? firstVisibleSpeechElement(contentRef.current) : startMode === 'selected' ? startElement : null
    if (startMode !== 'beginning' && !from) {
      setError('Прокрутите страницу к нужному тексту или выберите слово для начала чтения.')
      return
    }
    const chunks = collectSpeechChunks(contentRef.current, 1250, from)
    if (!chunks.length) { setError('Выберите другое слово для начала чтения.'); return }
    stop()
    const token = runRef.current
    setError('')
    try {
      for (let index = 0; index < chunks.length; index += 1) {
        if (token !== runRef.current) return
        setStatus('loading')
        setProgress(Math.round((index / chunks.length) * 100))
        const controller = new AbortController()
        abortRef.current = controller
        const chunk = chunks[index]
        // Generate at normal speed so timestamps always use the audio timeline.
        // HTML Audio applies the live rate, including changes during synthesis.
        const narration = await api.ttsNarration(chunk.text, selectedVoice.id, 1, controller.signal)
        if (token !== runRef.current) return
        if (!narration.boundaries.length) setError('Сервис не вернул метки слов. Чтение продолжится без подсветки.')
        setStatus('speaking')
        await playBlob(narrationBlob(narration.audio), token, alignSpeechBoundaries(chunk, narration.boundaries),
          (fraction) => setProgress(Math.round(((index + fraction) / chunks.length) * 100)))
        if (token !== runRef.current) return
        setProgress(Math.round(((index + 1) / chunks.length) * 100))
      }
      if (token === runRef.current) setStatus('idle')
    } catch (e) {
      if (token !== runRef.current) return
      clearAudio()
      setStatus('idle')
      setError(e instanceof Error ? e.message : 'Не удалось запустить озвучивание')
    } finally {
      if (token === runRef.current) abortRef.current = null
    }
  }

  const togglePause = () => {
    const audio = audioRef.current
    if (!audio) return
    if (status === 'paused') {
      const token = runRef.current
      audio.play().then(() => { if (token === runRef.current) setStatus('speaking') })
        .catch(() => { if (token === runRef.current) setError('Не удалось продолжить воспроизведение') })
    } else if (status === 'speaking') {
      audio.pause()
      setStatus('paused')
    }
  }

  const preview = async () => {
    if (!selectedVoice) return
    stop()
    const token = runRef.current
    setPreviewing(true)
    setError('')
    setStatus('loading')
    try {
      const controller = new AbortController()
      abortRef.current = controller
      const phrase = /ru-RU/.test(selectedVoice.id) ? 'Здравствуйте. Так звучит выбранный голос в BookNest.' : 'Hello. This is the selected BookNest reading voice.'
      const blob = await api.ttsAudio(phrase, selectedVoice.id, 1, controller.signal)
      if (token !== runRef.current) return
      setStatus('speaking')
      await playBlob(blob, token)
      if (token === runRef.current) setStatus('idle')
    } catch (e) {
      if (token !== runRef.current) return
      clearAudio()
      setStatus('idle')
      setError(e instanceof Error ? e.message : 'Не удалось прослушать голос')
    } finally {
      if (token === runRef.current) {
        setPreviewing(false)
        abortRef.current = null
      }
    }
  }

  if (picking) return (
    <div className="speech-pick-hint" role="region" aria-label="Выбор начала чтения">
      <span>Нажмите на слово, с которого читать</span>
      <button className="btn ghost" onClick={() => { setPicking(false); onOpen() }}>Отмена</button>
    </div>
  )
  if (!open) return null

  return (
    <aside className="speech-panel neural-speech-panel" role="dialog" aria-label="Диктор">
      <div className="speech-head">
        <div><span className="eyebrow">Neural reader</span><h3>Живое озвучивание</h3></div>
        <button className="icon-btn" onClick={onClose} aria-label="Закрыть"><X size={18} /></button>
      </div>

      <div className="speech-now">
        <span><Sparkles size={16} /></span>
        <div><strong>{title}</strong><small>{status === 'loading' ? 'Готовлю следующий фрагмент…' : status === 'paused' ? 'На паузе' : status === 'speaking' ? (previewing ? 'Демонстрация голоса' : 'Читаю вслух') : 'Готов к чтению'}</small></div>
      </div>
      <div className="speech-progress"><i style={{ width: `${progress}%` }} /></div>

      <label className="speech-field">
        <span>Начать чтение</span>
        <select aria-label="Начать чтение" value={startMode} onChange={(e) => setStartMode(e.target.value as StartMode)}>
          <option value="beginning">С начала главы</option>
          <option value="visible">С текущего места на странице</option>
          <option value="selected" disabled={!startElement}>С выбранного слова</option>
        </select>
      </label>
      <div className="speech-start-controls">
        <button className="btn ghost" onClick={() => { stop(); setPicking(true); onPickStart() }}>Выбрать слово в тексте</button>
        {startMode === 'selected' && <p className="speech-start-excerpt">«{startExcerpt}…»</p>}
        {startMode === 'visible' && <p className="speech-start-excerpt">Чтение начнётся с первого видимого слова при запуске.</p>}
      </div>

      <label className="speech-field voice-field">
        <span>Neural-голос</span>
        <div className="voice-select-row">
          <select value={selectedVoice?.id || ''} onChange={(e) => setVoiceId(e.target.value)} disabled={!voices.length}>
            {voices.map((voice) => <option key={voice.id} value={voice.id}>{voice.name} · {voice.description}</option>)}
          </select>
          <button className="voice-preview" onClick={preview} disabled={!selectedVoice || status === 'loading'} title="Прослушать голос"><Volume2 size={16} /></button>
        </div>
        {selectedVoice && <small className="voice-description">{selectedVoice.language} · {selectedVoice.gender === 'female' ? 'женский' : 'мужской'} · {selectedVoice.description}</small>}
      </label>

      <label className="speech-field"><span>Скорость <b>{rate.toLocaleString('ru-RU', { maximumFractionDigits: 2 })}×</b></span><input aria-label="Скорость чтения" type="range" min="0.7" max="1.35" step="0.05" value={rate} onChange={(e) => setRate(Number(e.target.value))} /></label>
      <div className="speech-highlight-setting toggle-row">
        <div><span id="speech-highlight-label">Подсветка слов</span><small>Выделять слова во время чтения</small></div>
        <button type="button" className={`toggle ${highlightEnabled ? 'on' : ''}`} role="switch" aria-checked={highlightEnabled}
          aria-labelledby="speech-highlight-label" onClick={() => setHighlightEnabled(!highlightEnabled)}><i /></button>
      </div>
      {error && <div className="speech-error" role="status">{error}</div>}

      <div className="speech-actions">
        <button className="btn primary" onClick={status === 'idle' ? start : status === 'loading' ? stop : togglePause}>
          {status === 'speaking' ? <Pause size={17} /> : status === 'loading' ? <RotateCcw size={17} /> : <Play size={17} />}
          {status === 'paused' ? 'Продолжить' : status === 'speaking' ? 'Пауза' : status === 'loading' ? 'Отменить' : startMode === 'beginning' ? 'Читать главу' : 'Читать отсюда'}
        </button>
        <button className="btn ghost" onClick={stop} disabled={status === 'idle'}><RotateCcw size={16} /> Стоп</button>
      </div>
      <p className="speech-note">Озвучивание создаётся neural-сервисом на сервере, поэтому для диктора нужен интернет.</p>
    </aside>
  )
}
