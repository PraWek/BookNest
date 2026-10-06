import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import { memo } from 'react'
import { rehypeSpeechWords } from './SpeechText'
import 'katex/dist/katex.min.css'

export default memo(function MarkdownChapter({ source }: { source: string }) {
  return (
    <div className="markdown-body">
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex, rehypeSpeechWords]}>
        {source}
      </ReactMarkdown>
    </div>
  )
})
