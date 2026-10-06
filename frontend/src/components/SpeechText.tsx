import { memo } from 'react'
import type { Element, Root, RootContent, Text } from 'hast'

export const speechTokens = (text: string) => text.match(/\s+|\S+/gu) ?? []

// Keep whitespace as text nodes so wrapping words never changes the layout.
export default memo(function SpeechText({ text }: { text: string }) {
  return <>{speechTokens(text).map((token, index) => /^\s+$/u.test(token)
    ? token
    : <span data-speech-word="" key={index}>{token}</span>)}</>
})

export function rehypeSpeechWords() {
  return (tree: Root) => {
    const visit = (parent: Root | Element) => {
      if (parent.type === 'element' && (parent.tagName === 'pre' ||
        (parent.properties.className as string[] | undefined)?.some((name) => name === 'katex' || name === 'katex-display'))) return
      parent.children = parent.children.flatMap((child): RootContent[] => {
        if (child.type === 'element') visit(child)
        if (child.type !== 'text') return [child]
        return speechTokens(child.value).map((token): Element | Text => /^\s+$/u.test(token)
          ? { type: 'text', value: token }
          : { type: 'element', tagName: 'span', properties: { 'data-speech-word': '' }, children: [{ type: 'text', value: token }] })
      }) as typeof parent.children
    }
    visit(tree)
  }
}
