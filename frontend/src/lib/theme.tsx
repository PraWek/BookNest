import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { api } from './api'
import { appearanceReducer, createAppearanceState, currentPageTheme, currentReaderSettings, PAGE_THEMES, resolveTheme } from './appearance'
import type { AppStyle, AppTheme, AppearancePreferences, PageTheme, ReaderSettings, ResolvedTheme } from './types'

type AppearanceContextValue = {
  theme: AppTheme
  style: AppStyle
  resolvedTheme: ResolvedTheme
  pageTheme: PageTheme
  settings: ReaderSettings
  preferencesLoaded: boolean
  setTheme: (theme: AppTheme) => void
  setStyle: (style: AppStyle) => void
  setSettings: Dispatch<SetStateAction<ReaderSettings>>
}

const AppearanceContext = createContext<AppearanceContextValue | null>(null)

function storedObject(value: string | null): Record<string, unknown> {
  try {
    const parsed = value ? JSON.parse(value) : null
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch { return {} }
}
function readStoredAppearance() {
  let preferences: Partial<AppearancePreferences> = {}
  let hasMode = false, hasStyle = false, hasPages = false, hasSettings = false
  try {
    const mode = localStorage.getItem('booknest-ui-theme')
    const style = localStorage.getItem('booknest-ui-style')
    const page = localStorage.getItem('booknest-reader-theme')
    const pages = storedObject(localStorage.getItem('booknest-page-themes'))
    const settings = storedObject(localStorage.getItem('booknest-reader-settings'))
    hasMode = mode === 'system' || mode === 'light' || mode === 'dark'
    hasStyle = style === 'soft' || style === 'glass' || style === 'liquid' || style === 'minimal'
    hasPages = PAGE_THEMES.some((item) => item.key === page || item.key === pages[item.mode])
    hasSettings = Object.keys(settings).length > 0
    preferences = {
      ...settings,
      uiTheme: hasMode ? mode as AppTheme : 'system',
      uiStyle: hasStyle ? style as AppStyle : 'liquid',
      theme: page as PageTheme,
      pageThemes: pages as AppearancePreferences['pageThemes'],
    }
  } catch { /* Use defaults when browser storage is unavailable or invalid. */ }
  return { state: createAppearanceState(preferences, window.matchMedia('(prefers-color-scheme: dark)').matches), hasMode, hasStyle, hasPages, hasSettings }
}

export function AppearanceProvider({ children }: { children: React.ReactNode }) {
  const [initial] = useState(readStoredAppearance)
  const [state, dispatch] = useReducer(appearanceReducer, initial.state)
  const stateRef = useRef(state)
  stateRef.current = state
  const changed = useRef({ mode: false, style: false, pages: false, settings: false })
  const [preferencesLoaded, setPreferencesLoaded] = useState(false)
  const [canSave, setCanSave] = useState(false)
  const saveQueue = useRef<Promise<unknown>>(Promise.resolve())
  const resolvedTheme = resolveTheme(state.theme, state.systemDark)
  const pageTheme = currentPageTheme(state)
  const settings = useMemo(() => currentReaderSettings(state), [state])

  useEffect(() => {
    let active = true
    api.preferences().then((saved) => {
      if (!active) return
      dispatch({
        type: 'hydrate', preferences: saved.settings,
        preserveMode: initial.hasMode || changed.current.mode,
        preserveStyle: initial.hasStyle || changed.current.style,
        preservePages: initial.hasPages || changed.current.pages,
        preserveSettings: changed.current.settings,
      })
      setCanSave(true)
    }).catch(() => undefined).finally(() => { if (active) setPreferencesLoaded(true) })
    return () => { active = false }
  }, [initial])

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const sync = () => dispatch({ type: 'system', dark: media.matches })
    sync()
    media.addEventListener?.('change', sync)
    return () => media.removeEventListener?.('change', sync)
  }, [])

  useLayoutEffect(() => {
    const root = document.documentElement
    const background = PAGE_THEMES.find((item) => item.key === pageTheme)!.background
    root.dataset.uiTheme = state.theme
    root.dataset.uiStyle = state.style
    root.dataset.resolvedTheme = resolvedTheme
    root.dataset.pageTheme = pageTheme
    root.style.colorScheme = resolvedTheme
    root.style.setProperty('--boot-bg', background)
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', background)
    try {
      if (preferencesLoaded || initial.hasMode || initial.hasStyle || initial.hasPages || changed.current.mode || changed.current.style || changed.current.pages) {
        localStorage.setItem('booknest-ui-theme', state.theme)
        localStorage.setItem('booknest-ui-style', state.style)
        localStorage.setItem('booknest-reader-theme', pageTheme)
        localStorage.setItem('booknest-page-themes', JSON.stringify(state.pageThemes))
      }
      if (preferencesLoaded || initial.hasSettings || changed.current.settings) localStorage.setItem('booknest-reader-settings', JSON.stringify(settings))
    } catch { /* Changes still work in memory when storage is disabled. */ }
  }, [state, resolvedTheme, pageTheme, settings, preferencesLoaded, initial])

  useEffect(() => {
    if (!canSave) return
    const timer = window.setTimeout(() => {
      const preferences = { ...settings, uiTheme: state.theme, uiStyle: state.style, pageThemes: state.pageThemes }
      saveQueue.current = saveQueue.current.then(() => api.savePreferences(preferences)).catch(() => undefined)
    }, 450)
    return () => clearTimeout(timer)
  }, [state, settings, canSave])

  const setTheme = useCallback((theme: AppTheme) => {
    changed.current.mode = true
    const action = { type: 'theme' as const, theme }
    stateRef.current = appearanceReducer(stateRef.current, action)
    dispatch(action)
  }, [])
  const setStyle = useCallback((style: AppStyle) => {
    changed.current.style = true
    const action = { type: 'style' as const, style }
    stateRef.current = appearanceReducer(stateRef.current, action)
    dispatch(action)
  }, [])
  const setSettings: Dispatch<SetStateAction<ReaderSettings>> = useCallback((update) => {
    const current = currentReaderSettings(stateRef.current)
    const next = typeof update === 'function' ? update(current) : update
    changed.current.settings = true
    if (next.theme !== current.theme) {
      changed.current.pages = true
      changed.current.mode = true
    }
    const action = { type: 'settings' as const, settings: next }
    stateRef.current = appearanceReducer(stateRef.current, action)
    dispatch(action)
  }, [])

  const value = useMemo(() => ({ theme: state.theme, style: state.style, resolvedTheme, pageTheme, settings, preferencesLoaded, setTheme, setStyle, setSettings }),
    [state.theme, state.style, resolvedTheme, pageTheme, settings, preferencesLoaded, setTheme, setStyle, setSettings])

  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>
}

export function useAppearance() {
  const value = useContext(AppearanceContext)
  if (!value) throw new Error('useAppearance must be used inside AppearanceProvider')
  return value
}

export type { AppTheme, AppStyle }
