import { useState } from 'react'
import { Droplets, Feather, Grid2X2, Laptop, Layers3, Moon, Palette, Sparkles, Sun } from 'lucide-react'
import { useAppearance, type AppStyle } from '../lib/theme'

const STYLE_ORDER: AppStyle[] = ['soft', 'glass', 'liquid', 'minimal']
const STYLE_NAMES: Record<AppStyle, string> = {
  soft: 'Editorial',
  glass: 'Glass Cards',
  liquid: 'Liquid Glass',
  minimal: 'Minimal',
}

function StyleIcon({ style, size = 14 }: { style: AppStyle; size?: number }) {
  if (style === 'liquid') return <Droplets size={size} />
  if (style === 'glass') return <Layers3 size={size} />
  if (style === 'minimal') return <Grid2X2 size={size} />
  return <Feather size={size} />
}

export default function AppearanceControl({ compact = false }: { compact?: boolean }) {
  const { theme, style, setTheme, setStyle } = useAppearance()
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <div className={`appearance-control ${compact ? 'compact' : ''}`}>
      <div className="appearance-group" aria-label="Тема сайта">
        <button className={theme === 'system' ? 'active' : ''} onClick={() => setTheme('system')} title="Системная тема"><Laptop size={15} /><span>Система</span></button>
        <button className={theme === 'light' ? 'active' : ''} onClick={() => setTheme('light')} title="Светлая тема"><Sun size={15} /><span>Светлая</span></button>
        <button className={theme === 'dark' ? 'active' : ''} onClick={() => setTheme('dark')} title="Тёмная тема"><Moon size={15} /><span>Тёмная</span></button>
      </div>

      {compact ? (
        <div className="style-picker-compact">
          <button className={`appearance-style-cycle style-${style}`} onClick={() => setMenuOpen((v) => !v)} title="Изменить оформление" aria-expanded={menuOpen}>
            <StyleIcon style={style} size={15} /><span>{STYLE_NAMES[style]}</span>
          </button>
          {menuOpen && (
            <div className="style-popover">
              <div className="style-popover-head"><Palette size={14} /><span>Оформление страницы</span></div>
              {STYLE_ORDER.map((item) => (
                <button key={item} className={`style-${item} ${style === item ? 'active' : ''}`} aria-pressed={style === item} onClick={() => { setStyle(item); setMenuOpen(false) }}>
                  <StyleIcon style={item} /><span><strong>{STYLE_NAMES[item]}</strong><small>{item === 'soft' ? 'Классическая книжная сетка' : item === 'glass' ? 'Карточки и матовое стекло' : item === 'liquid' ? 'Плавающее жидкое стекло' : 'Чистый список без декора'}</small></span>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="appearance-style-row">
          <span><Palette size={14} /> Оформление</span>
          <div className="appearance-group style-choices">
            {STYLE_ORDER.map((item) => <button key={item} className={`style-${item} ${style === item ? 'active' : ''}`} aria-pressed={style === item} onClick={() => setStyle(item)}><StyleIcon style={item} /> {STYLE_NAMES[item]}</button>)}
          </div>
        </div>
      )}
    </div>
  )
}
