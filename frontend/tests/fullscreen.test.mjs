import assert from 'node:assert/strict'
import test from 'node:test'
import { currentFullscreenElement, enterFullscreen, leaveFullscreen } from '../src/lib/fullscreen.ts'

test('native fullscreen enters from a tap and can be toggled off', async () => {
  const doc = { fullscreenElement: null, fullscreenEnabled: true, async exitFullscreen() { assert.equal(this, doc); this.fullscreenElement = null } }
  const element = { ownerDocument: doc, async requestFullscreen(options) {
    assert.equal(this, element)
    assert.deepEqual(options, { navigationUI: 'hide' })
    doc.fullscreenElement = element
  } }
  assert.equal(await enterFullscreen(element), true)
  assert.equal(currentFullscreenElement(doc), element)
  assert.equal(await leaveFullscreen(doc), true)
  assert.equal(currentFullscreenElement(doc), null)
})

test('legacy WebKit fullscreen supports methods that return no promise', async () => {
  const doc = { webkitFullscreenEnabled: true, webkitFullscreenElement: null, webkitExitFullscreen() { assert.equal(this, doc); this.webkitFullscreenElement = null } }
  const element = { ownerDocument: doc, webkitRequestFullscreen() { assert.equal(this, element); doc.webkitFullscreenElement = element } }
  assert.equal(await enterFullscreen(element), true)
  assert.equal(currentFullscreenElement(doc), element)
  assert.equal(await leaveFullscreen(doc), true)
  assert.equal(currentFullscreenElement(doc), null)
})

test('unsupported fullscreen selects the in-page fallback', async () => {
  assert.equal(await enterFullscreen({ ownerDocument: {} }), false)
  assert.equal(await leaveFullscreen({}), true)
})

test('a WebKit method that does not activate fullscreen selects the fallback', async () => {
  const doc = { webkitFullscreenElement: null, webkitExitFullscreen() {} }
  const element = { ownerDocument: doc, webkitRequestFullscreen() {} }
  assert.equal(await enterFullscreen(element), false)
})

test('WebKit may be available even when the standard API is disabled', async () => {
  const doc = { fullscreenEnabled: false, webkitFullscreenElement: null, exitFullscreen() {}, webkitExitFullscreen() {} }
  const element = { ownerDocument: doc, requestFullscreen() { assert.fail('standard API is disabled') }, webkitRequestFullscreen() { doc.webkitFullscreenElement = element } }
  assert.equal(await enterFullscreen(element), true)
})

test('disabled fullscreen never invokes the browser request', async () => {
  const element = { ownerDocument: { fullscreenEnabled: false, exitFullscreen() {} }, requestFullscreen() { assert.fail('disabled API should not be invoked') } }
  assert.equal(await enterFullscreen(element), false)
})

test('rejected native and WebKit requests select the fallback without throwing', async () => {
  const standard = { ownerDocument: { exitFullscreen() {} }, requestFullscreen: async () => { throw new Error('webview refused') } }
  const webkit = { ownerDocument: { webkitExitFullscreen() {} }, webkitRequestFullscreen: () => { throw new Error('not supported') } }
  assert.equal(await enterFullscreen(standard), false)
  assert.equal(await enterFullscreen(webkit), false)
})

test('native fullscreen is used only when there is an exit method', async () => {
  const element = { ownerDocument: {}, requestFullscreen() { assert.fail('the user needs a reversible mode') } }
  assert.equal(await enterFullscreen(element), false)
})

test('failed exit preserves fullscreen so the exit control remains available', async () => {
  const element = {}
  const doc = { fullscreenElement: element, exitFullscreen: async () => { throw new Error('failed exit') } }
  assert.equal(await leaveFullscreen(doc), false)
  assert.equal(currentFullscreenElement(doc), element)
})
