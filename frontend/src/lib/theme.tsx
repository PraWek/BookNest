import { createContext, useContext, useEffect, useMemo, useState } from 'react'

type AppTheme = 'system' | 'light' | 'dark'
type AppStyle = 'soft' | 'glass' | 'minimal'

type AppearanceContextValue = {
  theme: AppTheme
  style: AppStyle
  setTheme: (theme: AppTheme) => void
  setStyle: (style: AppStyle) => void
}

const AppearanceContext = createContext<AppearanceContextValue | null>(null)
const THEME_KEY = 'booknest-ui-theme'
const STYLE_KEY = 'booknest-ui-style'

function getStoredTheme(): AppTheme {
  const saved = localStorage.getItem(THEME_KEY)
  return saved === 'light' || saved === 'dark' || saved === 'system' ? saved : 'system'
}

function getStoredStyle(): AppStyle {
  const saved = localStorage.getItem(STYLE_KEY)
  return saved === 'soft' || saved === 'glass' || saved === 'minimal' ? saved : 'soft'
}

export function AppearanceProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<AppTheme>(getStoredTheme)
  const [style, setStyleState] = useState<AppStyle>(getStoredStyle)

  useEffect(() => {
    const root = document.documentElement
    root.dataset.uiTheme = theme
    root.dataset.uiStyle = style
    localStorage.setItem(THEME_KEY, theme)
    localStorage.setItem(STYLE_KEY, style)

    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const syncSystem = () => {
      root.dataset.resolvedTheme = theme === 'system' ? (media.matches ? 'dark' : 'light') : theme
      root.style.colorScheme = root.dataset.resolvedTheme
    }
    syncSystem()
    media.addEventListener?.('change', syncSystem)
    return () => media.removeEventListener?.('change', syncSystem)
  }, [theme, style])

  const value = useMemo(() => ({
    theme,
    style,
    setTheme: (next: AppTheme) => setThemeState(next),
    setStyle: (next: AppStyle) => setStyleState(next),
  }), [theme, style])

  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>
}

export function useAppearance() {
  const value = useContext(AppearanceContext)
  if (!value) throw new Error('useAppearance must be used inside AppearanceProvider')
  return value
}

export type { AppTheme, AppStyle }
