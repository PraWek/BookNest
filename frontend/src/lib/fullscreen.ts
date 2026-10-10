type FullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null
  webkitFullscreenEnabled?: boolean
  webkitExitFullscreen?: () => Promise<void> | void
}
type FullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void
}

export function currentFullscreenElement(doc: FullscreenDocument = document): Element | null {
  return doc.fullscreenElement || doc.webkitFullscreenElement || null
}

// Call from the tap handler: native fullscreen requires user activation.
// Unsupported or rejected requests fall back to expanding the reader in-page.
export async function enterFullscreen(element: FullscreenElement, doc: FullscreenDocument = element.ownerDocument): Promise<boolean> {
  try {
    if (typeof element.requestFullscreen === 'function' && doc.fullscreenEnabled !== false && typeof doc.exitFullscreen === 'function') {
      await element.requestFullscreen({ navigationUI: 'hide' })
      return true
    }
    if (typeof element.webkitRequestFullscreen === 'function' && doc.webkitFullscreenEnabled !== false && typeof doc.webkitExitFullscreen === 'function') {
      await element.webkitRequestFullscreen()
      return Boolean(currentFullscreenElement(doc))
    }
  } catch { /* A webview or browser policy may refuse native fullscreen. */ }
  return false
}

export async function leaveFullscreen(doc: FullscreenDocument = document): Promise<boolean> {
  if (!currentFullscreenElement(doc)) return true
  try {
    if (doc.fullscreenElement && typeof doc.exitFullscreen === 'function') {
      await doc.exitFullscreen()
      return true
    }
    if (typeof doc.webkitExitFullscreen === 'function') {
      await doc.webkitExitFullscreen()
      return true
    }
  } catch { /* Keep the exit control available so the user can retry. */ }
  return false
}
