import { Pause, Play, RotateCcw, Volume2, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

type SpeechStatus = 'idle' | 'speaking' | 'paused'

function chunkText(text: string, maxLength = 1400) {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (!clean) return []
  const sentences = clean.match(/[^.!?…]+[.!?…]+|[^.!?…]+$/g) ?? [clean]
  const chunks: string[] = []
  let current = ''
  for (const sentence of sentences) {
    const part = sentence.trim()
    if (!part) continue
    if (current && current.length + part.length + 1 > maxLength) {
      chunks.push(current)
      current = part
    } else {
      current = current ? `${current} ${part}` : part
    }
  }
  if (current) chunks.push(current)
  return chunks
}

export default function SpeechPanel({ open, title, text, onClose }: { open: boolean; title: string; text: string; onClose: () => void }) {
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  const [voiceURI, setVoiceURI] = useState(() => localStorage.getItem('booknest-tts-voice') || '')
  const [rate, setRate] = useState(() => Number(localStorage.getItem('booknest-tts-rate') || '1'))
  const [status, setStatus] = useState<SpeechStatus>('idle')
  const [progress, setProgress] = useState(0)
  const cancelled = useRef(false)
  const chunks = useMemo(() => chunkText(`${title}. ${text}`), [title, text])

  useEffect(() => {
    if (!supported) return
    const loadVoices = () => setVoices(window.speechSynthesis.getVoices())
    loadVoices()
    window.speechSynthesis.addEventListener?.('voiceschanged', loadVoices)
    return () => window.speechSynthesis.removeEventListener?.('voiceschanged', loadVoices)
  }, [supported])

  useEffect(() => {
    return () => {
      if (supported) window.speechSynthesis.cancel()
    }
  }, [supported, text])

  useEffect(() => {
    localStorage.setItem('booknest-tts-rate', String(rate))
  }, [rate])

  const selectedVoice = useMemo(() => {
    if (!voices.length) return undefined
    const saved = voices.find((voice) => voice.voiceURI === voiceURI)
    const russian = voices.find((voice) => voice.lang.toLowerCase().startsWith('ru'))
    return saved || russian || voices.find((voice) => voice.default) || voices[0]
  }, [voices, voiceURI])

  const speakChunk = (index: number) => {
    if (!supported || cancelled.current || index >= chunks.length) {
      setStatus('idle')
      setProgress(index >= chunks.length ? 100 : 0)
      return
    }
    const utterance = new SpeechSynthesisUtterance(chunks[index])
    if (selectedVoice) utterance.voice = selectedVoice
    utterance.rate = rate
    utterance.pitch = 1
    utterance.onstart = () => {
      setStatus('speaking')
      setProgress(Math.round((index / Math.max(1, chunks.length)) * 100))
    }
    utterance.onend = () => {
      if (!cancelled.current) speakChunk(index + 1)
    }
    utterance.onerror = () => {
      if (!cancelled.current) setStatus('idle')
    }
    window.speechSynthesis.speak(utterance)
  }

  const start = () => {
    if (!supported || !chunks.length) return
    cancelled.current = true
    window.speechSynthesis.cancel()
    cancelled.current = false
    setProgress(0)
    window.setTimeout(() => speakChunk(0), 20)
  }

  const togglePause = () => {
    if (!supported) return
    if (status === 'paused') {
      window.speechSynthesis.resume()
      setStatus('speaking')
    } else if (status === 'speaking') {
      window.speechSynthesis.pause()
      setStatus('paused')
    }
  }

  const stop = () => {
    if (!supported) return
    cancelled.current = true
    window.speechSynthesis.cancel()
    setStatus('idle')
    setProgress(0)
  }

  if (!open) return null

  return (
    <aside className="speech-panel" role="dialog" aria-label="Диктор">
      <div className="speech-head">
        <div><span className="eyebrow">Диктор</span><h3>Озвучивание текста</h3></div>
        <button className="icon-btn" onClick={onClose} aria-label="Закрыть"><X size={18} /></button>
      </div>
      {!supported ? (
        <div className="speech-unsupported">Этот браузер не поддерживает встроенный синтез речи.</div>
      ) : (
        <>
          <div className="speech-now"><span><Volume2 size={16} /></span><div><strong>{title}</strong><small>{status === 'idle' ? 'Готов к чтению' : status === 'paused' ? 'На паузе' : 'Читаю вслух'}</small></div></div>
          <div className="speech-progress"><i style={{ width: `${progress}%` }} /></div>
          <label className="speech-field"><span>Голос</span><select value={selectedVoice?.voiceURI || ''} onChange={(e) => { setVoiceURI(e.target.value); localStorage.setItem('booknest-tts-voice', e.target.value) }}>{voices.map((voice) => <option key={voice.voiceURI} value={voice.voiceURI}>{voice.name} · {voice.lang}</option>)}</select></label>
          <label className="speech-field"><span>Скорость <b>{rate.toFixed(1)}×</b></span><input type="range" min="0.6" max="1.8" step="0.1" value={rate} onChange={(e) => setRate(Number(e.target.value))} /></label>
          <div className="speech-actions">
            <button className="btn primary" onClick={status === 'idle' ? start : togglePause}>{status === 'speaking' ? <Pause size={17} /> : <Play size={17} />}{status === 'paused' ? 'Продолжить' : status === 'speaking' ? 'Пауза' : 'Читать главу'}</button>
            <button className="btn ghost" onClick={stop} disabled={status === 'idle'}><RotateCcw size={16} /> Стоп</button>
          </div>
          <p className="speech-note">Используются голоса, установленные в вашей системе или браузере. Текст книги не отправляется во внешний сервис озвучки.</p>
        </>
      )}
    </aside>
  )
}
