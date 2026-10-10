import { useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Droplets, Feather, Grid2X2, Laptop, Layers3, Moon, Palette, Sun, X } from 'lucide-react'
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
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuId = useId()
  const [menuPosition, setMenuPosition] = useState({ left: 14, top: 14, width: 285, maxHeight: 400 })

  useLayoutEffect(() => {
    if (!menuOpen) return
    const position = () => {
      const trigger = triggerRef.current
      const menu = menuRef.current
      if (!trigger || !menu) return
      const rect = trigger.getBoundingClientRect()
      const width = Math.min(285, document.documentElement.clientWidth - 28)
      const maxHeight = Math.max(0, window.innerHeight - 28)
      const height = Math.min(menu.scrollHeight, maxHeight)
      const below = rect.bottom + 10
      setMenuPosition({
        left: Math.max(14, Math.min(rect.right - width, document.documentElement.clientWidth - width - 14)),
        top: Math.max(14, Math.min(below + height <= window.innerHeight - 14 ? below : rect.top - height - 10, window.innerHeight - height - 14)),
        width,
        maxHeight,
      })
    }
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !menuRef.current?.contains(event.target) && !triggerRef.current?.contains(event.target)) setMenuOpen(false)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setMenuOpen(false)
      triggerRef.current?.focus()
    }
    position()
    const observer = new ResizeObserver(position)
    if (menuRef.current) observer.observe(menuRef.current)
    window.addEventListener('resize', position)
    window.addEventListener('scroll', position, true)
    document.addEventListener('pointerdown', closeOutside)
    document.addEventListener('keydown', escape)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', position)
      window.removeEventListener('scroll', position, true)
      document.removeEventListener('pointerdown', closeOutside)
      document.removeEventListener('keydown', escape)
    }
  }, [menuOpen])

  return (
    <div className={`appearance-control ${compact ? 'compact' : ''}`}>
      <div className="appearance-group" aria-label="Тема сайта">
        <button className={theme === 'system' ? 'active' : ''} onClick={() => setTheme('system')} title="Системная тема"><Laptop size={15} /><span>Система</span></button>
        <button className={theme === 'light' ? 'active' : ''} onClick={() => setTheme('light')} title="Светлая тема"><Sun size={15} /><span>Светлая</span></button>
        <button className={theme === 'dark' ? 'active' : ''} onClick={() => setTheme('dark')} title="Тёмная тема"><Moon size={15} /><span>Тёмная</span></button>
      </div>

      {compact ? (
        <div className="style-picker-compact">
          <button ref={triggerRef} className={`appearance-style-cycle style-${style}`} onClick={() => setMenuOpen((v) => !v)} title="Изменить оформление" aria-label={`Оформление: ${STYLE_NAMES[style]}`} aria-expanded={menuOpen} aria-controls={menuId}>
            <StyleIcon style={style} size={15} /><span>{STYLE_NAMES[style]}</span>
          </button>
          {menuOpen && createPortal(
            <div ref={menuRef} id={menuId} className="style-popover" style={menuPosition} role="group" aria-label="Оформление страницы">
              <div className="style-popover-head"><Palette size={14} /><span>Оформление страницы</span><button className="style-popover-close" onClick={() => setMenuOpen(false)} aria-label="Закрыть выбор оформления"><X size={18} /></button></div>
              {STYLE_ORDER.map((item) => (
                <button key={item} className={`style-${item} ${style === item ? 'active' : ''}`} aria-pressed={style === item} onClick={() => { setStyle(item); setMenuOpen(false) }}>
                  <StyleIcon style={item} /><span><strong>{STYLE_NAMES[item]}</strong><small>{item === 'soft' ? 'Классическая книжная сетка' : item === 'glass' ? 'Карточки и матовое стекло' : item === 'liquid' ? 'Плавающее жидкое стекло' : 'Чистый список без декора'}</small></span>
                </button>
              ))}
            </div>, document.body
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
