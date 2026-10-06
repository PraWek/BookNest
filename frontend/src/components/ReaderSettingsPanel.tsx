import { AlignJustify, AlignLeft, Minus, Plus, X } from 'lucide-react'
import type { ReaderSettings } from '../lib/types'
import AppearanceControl from './AppearanceControl'

const THEMES: { key: ReaderSettings['theme']; name: string }[] = [
  { key: 'paper', name: 'Бумага' },
  { key: 'ivory', name: 'Слоновая кость' },
  { key: 'sepia', name: 'Сепия' },
  { key: 'night', name: 'Ночь' },
  { key: 'midnight', name: 'Полночь' },
]

const FONTS: { key: ReaderSettings['fontFamily']; name: string; sample: string }[] = [
  { key: 'literata', name: 'Книжный', sample: 'Aa' },
  { key: 'georgia', name: 'Georgia', sample: 'Aa' },
  { key: 'humanist', name: 'Humanist', sample: 'Aa' },
  { key: 'sans', name: 'Sans', sample: 'Aa' },
  { key: 'mono', name: 'Mono', sample: 'Aa' },
]

export default function ReaderSettingsPanel({
  open,
  settings,
  onChange,
  onClose,
}: {
  open: boolean
  settings: ReaderSettings
  onChange: (next: ReaderSettings) => void
  onClose: () => void
}) {
  const set = <K extends keyof ReaderSettings>(key: K, value: ReaderSettings[K]) => onChange({ ...settings, [key]: value })

  return (
    <aside className={`reader-panel settings-panel ${open ? 'open' : ''}`} aria-hidden={!open}>
      <div className="panel-head">
        <div>
          <span className="eyebrow">Вид страницы</span>
          <h3>Настройки чтения</h3>
        </div>
        <button className="icon-btn" onClick={onClose} aria-label="Закрыть настройки"><X size={18} /></button>
      </div>

      <div className="settings-scroll">
        <div className="setting-section app-appearance-section">
          <label>Интерфейс сайта</label>
          <AppearanceControl />
        </div>

        <div className="setting-section">
          <label>Тема страницы книги</label>
          <div className="theme-grid">
            {THEMES.map((theme) => (
              <button key={theme.key} className={`theme-chip ${theme.key} ${settings.theme === theme.key ? 'active' : ''}`} onClick={() => set('theme', theme.key)}>
                <i /> <span>{theme.name}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="setting-section">
          <label>Шрифт</label>
          <div className="font-grid">
            {FONTS.map((font) => (
              <button key={font.key} className={`font-choice ${settings.fontFamily === font.key ? 'active' : ''} font-${font.key}`} onClick={() => set('fontFamily', font.key)}>
                <b>{font.sample}</b><span>{font.name}</span>
              </button>
            ))}
          </div>
        </div>

        <SettingStepper label="Размер текста" value={`${settings.fontSize}px`} onMinus={() => set('fontSize', Math.max(14, settings.fontSize - 1))} onPlus={() => set('fontSize', Math.min(34, settings.fontSize + 1))} />

        <div className="setting-section slider-setting">
          <div className="setting-label"><label>Межстрочный интервал</label><output>{settings.lineHeight.toFixed(2)}</output></div>
          <input type="range" min="1.3" max="2.25" step="0.05" value={settings.lineHeight} onChange={(e) => set('lineHeight', Number(e.target.value))} />
        </div>

        <div className="setting-section slider-setting">
          <div className="setting-label"><label>Ширина страницы</label><output>{settings.contentWidth}px</output></div>
          <input type="range" min="520" max="1080" step="20" value={settings.contentWidth} onChange={(e) => set('contentWidth', Number(e.target.value))} />
        </div>

        <div className="setting-section slider-setting">
          <div className="setting-label"><label>Интервал абзацев</label><output>{settings.paragraphSpacing.toFixed(1)}em</output></div>
          <input type="range" min="0.35" max="1.8" step="0.05" value={settings.paragraphSpacing} onChange={(e) => set('paragraphSpacing', Number(e.target.value))} />
        </div>

        <div className="setting-section slider-setting">
          <div className="setting-label"><label>Разрядка букв</label><output>{settings.letterSpacing.toFixed(2)}px</output></div>
          <input type="range" min="-0.4" max="1.2" step="0.05" value={settings.letterSpacing} onChange={(e) => set('letterSpacing', Number(e.target.value))} />
        </div>

        <div className="setting-section">
          <label>Выравнивание</label>
          <div className="segmented two">
            <button className={settings.textAlign === 'left' ? 'active' : ''} onClick={() => set('textAlign', 'left')}><AlignLeft size={16} /> По левому</button>
            <button className={settings.textAlign === 'justify' ? 'active' : ''} onClick={() => set('textAlign', 'justify')}><AlignJustify size={16} /> По ширине</button>
          </div>
        </div>

        <div className="setting-section toggle-row">
          <div><label>Режим фокусировки</label><span>Скрывает лишние элементы во время чтения</span></div>
          <button className={`toggle ${settings.focusMode ? 'on' : ''}`} onClick={() => set('focusMode', !settings.focusMode)} aria-label="Режим фокусировки"><i /></button>
        </div>
      </div>
    </aside>
  )
}

function SettingStepper({ label, value, onMinus, onPlus }: { label: string; value: string; onMinus: () => void; onPlus: () => void }) {
  return (
    <div className="setting-section stepper-row">
      <label>{label}</label>
      <div className="stepper"><button onClick={onMinus}><Minus size={15} /></button><output>{value}</output><button onClick={onPlus}><Plus size={15} /></button></div>
    </div>
  )
}
