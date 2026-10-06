import { Laptop, Moon, Palette, Sparkles, Sun } from 'lucide-react'
import { useAppearance } from '../lib/theme'

export default function AppearanceControl({ compact = false }: { compact?: boolean }) {
  const { theme, style, setTheme, setStyle } = useAppearance()
  return (
    <div className={`appearance-control ${compact ? 'compact' : ''}`}>
      <div className="appearance-group" aria-label="Тема сайта">
        <button className={theme === 'system' ? 'active' : ''} onClick={() => setTheme('system')} title="Системная тема"><Laptop size={15} /><span>Система</span></button>
        <button className={theme === 'light' ? 'active' : ''} onClick={() => setTheme('light')} title="Светлая тема"><Sun size={15} /><span>Светлая</span></button>
        <button className={theme === 'dark' ? 'active' : ''} onClick={() => setTheme('dark')} title="Тёмная тема"><Moon size={15} /><span>Тёмная</span></button>
      </div>
      {!compact && (
        <div className="appearance-style-row">
          <span><Palette size={14} /> Оформление</span>
          <div className="appearance-group style-choices">
            <button className={style === 'soft' ? 'active' : ''} onClick={() => setStyle('soft')}><Sparkles size={14} /> Soft</button>
            <button className={style === 'glass' ? 'active' : ''} onClick={() => setStyle('glass')}>Glass</button>
            <button className={style === 'minimal' ? 'active' : ''} onClick={() => setStyle('minimal')}>Minimal</button>
          </div>
        </div>
      )}
    </div>
  )
}
