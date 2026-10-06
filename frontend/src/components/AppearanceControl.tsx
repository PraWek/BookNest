import { Droplets, Laptop, Moon, Palette, Sparkles, Sun } from 'lucide-react'
import { useAppearance, type AppStyle } from '../lib/theme'

const STYLE_ORDER: AppStyle[] = ['soft', 'glass', 'liquid', 'minimal']
const STYLE_NAMES: Record<AppStyle, string> = {
  soft: 'Soft',
  glass: 'Glass',
  liquid: 'Liquid Glass',
  minimal: 'Minimal',
}

export default function AppearanceControl({ compact = false }: { compact?: boolean }) {
  const { theme, style, setTheme, setStyle } = useAppearance()
  const cycleStyle = () => {
    const current = STYLE_ORDER.indexOf(style)
    setStyle(STYLE_ORDER[(current + 1) % STYLE_ORDER.length])
  }

  return (
    <div className={`appearance-control ${compact ? 'compact' : ''}`}>
      <div className="appearance-group" aria-label="Тема сайта">
        <button className={theme === 'system' ? 'active' : ''} onClick={() => setTheme('system')} title="Системная тема"><Laptop size={15} /><span>Система</span></button>
        <button className={theme === 'light' ? 'active' : ''} onClick={() => setTheme('light')} title="Светлая тема"><Sun size={15} /><span>Светлая</span></button>
        <button className={theme === 'dark' ? 'active' : ''} onClick={() => setTheme('dark')} title="Тёмная тема"><Moon size={15} /><span>Тёмная</span></button>
      </div>
      {compact ? (
        <button className={`appearance-style-cycle style-${style}`} onClick={cycleStyle} title={`Оформление: ${STYLE_NAMES[style]}. Нажмите, чтобы переключить`} aria-label={`Оформление: ${STYLE_NAMES[style]}`}>
          {style === 'liquid' ? <Droplets size={15} /> : <Palette size={15} />}
        </button>
      ) : (
        <div className="appearance-style-row">
          <span><Palette size={14} /> Оформление</span>
          <div className="appearance-group style-choices">
            <button className={style === 'soft' ? 'active' : ''} onClick={() => setStyle('soft')}><Sparkles size={14} /> Soft</button>
            <button className={style === 'glass' ? 'active' : ''} onClick={() => setStyle('glass')}>Glass</button>
            <button className={style === 'liquid' ? 'active' : ''} onClick={() => setStyle('liquid')}><Droplets size={14} /> Liquid</button>
            <button className={style === 'minimal' ? 'active' : ''} onClick={() => setStyle('minimal')}>Minimal</button>
          </div>
        </div>
      )}
    </div>
  )
}
