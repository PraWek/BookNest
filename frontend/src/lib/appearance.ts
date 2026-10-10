import type { AppearancePreferences, AppStyle, AppTheme, PageTheme, ReaderSettings, ResolvedTheme } from './types'

export const DEFAULT_READER_SETTINGS: ReaderSettings = {
  theme: 'paper', fontFamily: 'literata', fontSize: 19, lineHeight: 1.75,
  contentWidth: 760, letterSpacing: 0, paragraphSpacing: 1, textAlign: 'left', focusMode: false,
}
export const PAGE_THEMES: { key: PageTheme; name: string; mode: ResolvedTheme; background: string }[] = [
  { key: 'paper', name: 'Бумага', mode: 'light', background: '#f4efe5' },
  { key: 'ivory', name: 'Слоновая кость', mode: 'light', background: '#ece8dc' },
  { key: 'sepia', name: 'Сепия', mode: 'light', background: '#d9cbb4' },
  { key: 'night', name: 'Ночь', mode: 'dark', background: '#1b1c1b' },
  { key: 'midnight', name: 'Полночь', mode: 'dark', background: '#111821' },
]
export type AppearanceState = {
  theme: AppTheme
  style: AppStyle
  systemDark: boolean
  pageThemes: Record<ResolvedTheme, PageTheme>
  readerSettings: ReaderSettings
}
export type AppearanceAction =
  | { type: 'theme'; theme: AppTheme }
  | { type: 'style'; style: AppStyle }
  | { type: 'system'; dark: boolean }
  | { type: 'settings'; settings: ReaderSettings }
  | { type: 'hydrate'; preferences: AppearancePreferences; preserveMode: boolean; preserveStyle: boolean; preservePages: boolean; preserveSettings: boolean }

export function pageThemeMode(theme: unknown): ResolvedTheme | undefined {
  return PAGE_THEMES.find((item) => item.key === theme)?.mode
}
export function resolveTheme(theme: AppTheme, systemDark: boolean): ResolvedTheme {
  return theme === 'system' ? (systemDark ? 'dark' : 'light') : theme
}
export function currentPageTheme(state: AppearanceState): PageTheme {
  return state.pageThemes[resolveTheme(state.theme, state.systemDark)]
}
export function currentReaderSettings(state: AppearanceState): ReaderSettings {
  return { ...state.readerSettings, theme: currentPageTheme(state) }
}
export function createAppearanceState(preferences: Partial<AppearancePreferences> = {}, systemDark = false): AppearanceState {
  const pageThemes: AppearanceState['pageThemes'] = { light: 'paper', dark: 'night' }
  for (const mode of ['light', 'dark'] as const) {
    const saved = preferences.pageThemes?.[mode]
    if (pageThemeMode(saved) === mode) pageThemes[mode] = saved!
  }
  const legacyMode = pageThemeMode(preferences.theme)
  if (legacyMode && pageThemeMode(preferences.pageThemes?.[legacyMode]) !== legacyMode) pageThemes[legacyMode] = preferences.theme!
  const readerSettings = { ...DEFAULT_READER_SETTINGS }
  for (const key of Object.keys(readerSettings) as (keyof ReaderSettings)[]) {
    if (preferences[key] !== undefined) Object.assign(readerSettings, { [key]: preferences[key] })
  }
  return {
    theme: ['light', 'dark', 'system'].includes(preferences.uiTheme ?? '') ? preferences.uiTheme! : 'system',
    style: ['soft', 'glass', 'liquid', 'minimal'].includes(preferences.uiStyle ?? '') ? preferences.uiStyle! : 'liquid',
    systemDark, pageThemes, readerSettings,
  }
}
export function appearanceReducer(state: AppearanceState, action: AppearanceAction): AppearanceState {
  switch (action.type) {
    case 'theme': return { ...state, theme: action.theme }
    case 'style': return { ...state, style: action.style }
    case 'system': return { ...state, systemDark: action.dark }
    case 'settings': {
      const mode = pageThemeMode(action.settings.theme)
      if (!mode) return state
      return {
        ...state,
        theme: mode === resolveTheme(state.theme, state.systemDark) ? state.theme : mode,
        pageThemes: { ...state.pageThemes, [mode]: action.settings.theme },
        readerSettings: action.settings,
      }
    }
    case 'hydrate': {
      const loaded = createAppearanceState(action.preferences, state.systemDark)
      return {
        ...state,
        theme: action.preserveMode ? state.theme : loaded.theme,
        style: action.preserveStyle ? state.style : loaded.style,
        pageThemes: action.preservePages ? state.pageThemes : loaded.pageThemes,
        readerSettings: action.preserveSettings ? state.readerSettings : loaded.readerSettings,
      }
    }
  }
}
