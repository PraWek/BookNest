import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import { appearanceReducer, createAppearanceState, currentPageTheme, currentReaderSettings, DEFAULT_READER_SETTINGS, PAGE_THEMES, pageThemeMode, resolveTheme } from '../src/lib/appearance.ts'

const selectPage = (state, theme) => appearanceReducer(state, { type: 'settings', settings: { ...currentReaderSettings(state), theme } })
const hydrate = (state, preferences, flags = {}) => appearanceReducer(state, { type: 'hydrate', preferences, preserveMode: false, preserveStyle: false, preservePages: false, preserveSettings: false, ...flags })

test('light and dark modes offer only matching page palettes', () => {
  for (const mode of ['light', 'dark']) {
    const state = createAppearanceState({ uiTheme: mode, theme: mode === 'light' ? 'midnight' : 'sepia' })
    const choices = PAGE_THEMES.filter((item) => item.mode === resolveTheme(state.theme, state.systemDark))
    assert.deepEqual(choices.map((item) => item.key), mode === 'light' ? ['paper', 'ivory', 'sepia'] : ['night', 'midnight'])
    assert.ok(choices.some((item) => item.key === currentReaderSettings(state).theme))
  }
})

test('switching modes remembers each page palette and preserves reading settings', () => {
  let state = createAppearanceState({ uiTheme: 'light', fontSize: 26, focusMode: true })
  state = selectPage(state, 'sepia')
  state = appearanceReducer(state, { type: 'theme', theme: 'dark' })
  assert.equal(currentPageTheme(state), 'night')
  state = selectPage(state, 'midnight')
  state = appearanceReducer(state, { type: 'theme', theme: 'light' })
  assert.equal(currentPageTheme(state), 'sepia')
  assert.equal(currentReaderSettings(state).fontSize, 26)
  assert.equal(currentReaderSettings(state).focusMode, true)
  state = appearanceReducer(state, { type: 'theme', theme: 'dark' })
  assert.equal(currentReaderSettings(state).theme, 'midnight')
})

test('page choice synchronizes interface mode when its family changes', () => {
  let state = createAppearanceState({ uiTheme: 'light' })
  state = selectPage(state, 'midnight')
  assert.equal(state.theme, 'dark')
  assert.equal(currentPageTheme(state), 'midnight')
  state = selectPage(state, 'ivory')
  assert.equal(state.theme, 'light')
  assert.equal(currentReaderSettings(state).theme, 'ivory')
})

test('system mode follows the OS and preserves its palette choices', () => {
  let state = createAppearanceState({ uiTheme: 'system', pageThemes: { light: 'ivory', dark: 'midnight' } })
  state = selectPage(state, 'sepia')
  assert.equal(state.theme, 'system')
  state = appearanceReducer(state, { type: 'system', dark: true })
  assert.equal(currentPageTheme(state), 'midnight')
  state = appearanceReducer(state, { type: 'system', dark: false })
  assert.equal(currentPageTheme(state), 'sepia')
  state = appearanceReducer(state, { type: 'theme', theme: 'light' })
  state = appearanceReducer(state, { type: 'system', dark: true })
  assert.equal(currentPageTheme(state), 'sepia')
})

test('saved preferences round-trip both palettes, mode, style and typography', () => {
  let state = createAppearanceState({ uiTheme: 'light', uiStyle: 'glass', fontFamily: 'mono', fontSize: 24 })
  state = selectPage(state, 'sepia')
  state = appearanceReducer(state, { type: 'theme', theme: 'dark' })
  state = selectPage(state, 'midnight')
  const saved = { ...currentReaderSettings(state), uiTheme: state.theme, uiStyle: state.style, pageThemes: state.pageThemes }
  const loaded = createAppearanceState(saved)
  assert.deepEqual(currentReaderSettings(loaded), currentReaderSettings(state))
  assert.deepEqual(loaded.pageThemes, { light: 'sepia', dark: 'midnight' })
  assert.equal(loaded.theme, 'dark')
  assert.equal(loaded.style, 'glass')
})

test('late server preferences cannot replace choices made while loading', () => {
  let state = createAppearanceState()
  state = selectPage(state, 'midnight')
  state = appearanceReducer(state, { type: 'style', style: 'minimal' })
  state = appearanceReducer(state, { type: 'settings', settings: { ...currentReaderSettings(state), fontSize: 30 } })
  state = hydrate(state, { ...DEFAULT_READER_SETTINGS, uiTheme: 'light', uiStyle: 'soft', theme: 'sepia' },
    { preserveMode: true, preserveStyle: true, preservePages: true, preserveSettings: true })
  assert.equal(state.theme, 'dark')
  assert.equal(state.style, 'minimal')
  assert.equal(currentReaderSettings(state).theme, 'midnight')
  assert.equal(currentReaderSettings(state).fontSize, 30)
})

test('server typography can load without replacing local appearance choices', () => {
  const local = createAppearanceState({ uiTheme: 'dark', theme: 'midnight' })
  const state = hydrate(local, { ...DEFAULT_READER_SETTINGS, theme: 'sepia', fontSize: 27 },
    { preserveMode: true, preserveStyle: true, preservePages: true })
  assert.equal(currentReaderSettings(state).theme, 'midnight')
  assert.equal(currentReaderSettings(state).fontSize, 27)
})

test('legacy and invalid preferences still produce a palette matching the mode', () => {
  for (const mode of ['light', 'dark', 'system']) {
    for (const systemDark of [false, true]) {
      const state = createAppearanceState({ uiTheme: mode, theme: 'sepia', pageThemes: { light: 'midnight', dark: 'unknown' } }, systemDark)
      assert.equal(pageThemeMode(currentPageTheme(state)), resolveTheme(state.theme, systemDark))
    }
  }
})

test('the pre-React loading screen selects the same palette on book and home routes', () => {
  const script = readFileSync(new URL('../index.html', import.meta.url), 'utf8').match(/<script>([\s\S]*?)<\/script>/)[1]
  const cases = [
    { mode: 'light', page: 'sepia', pages: {} },
    { mode: 'dark', page: 'midnight', pages: {} },
    { mode: 'light', page: 'midnight', pages: { light: 'ivory', dark: 'midnight' } },
    { mode: 'system', page: 'sepia', pages: { light: 'sepia', dark: 'night' } },
    { mode: 'dark', page: 'midnight', pages: { dark: 'sepia' } },
  ]
  for (const saved of cases) for (const dark of [false, true]) for (const path of ['/', '/read/42']) {
    const state = createAppearanceState({ uiTheme: saved.mode, theme: saved.page, pageThemes: saved.pages }, dark)
    const storage = { 'booknest-ui-theme': saved.mode, 'booknest-reader-theme': saved.page, 'booknest-page-themes': JSON.stringify(saved.pages) }
    const root = { dataset: {}, style: { setProperty() {} } }
    const meta = {}
    vm.runInNewContext(script, { document: { documentElement: root, querySelector: () => meta }, location: { pathname: path }, localStorage: { getItem: (key) => storage[key] ?? null }, matchMedia: () => ({ matches: dark }) })
    assert.equal(root.dataset.pageTheme, currentPageTheme(state))
    assert.equal(root.dataset.resolvedTheme, resolveTheme(state.theme, dark))
    assert.equal(meta.content, PAGE_THEMES.find((item) => item.key === currentPageTheme(state)).background)
  }
})
