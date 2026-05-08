import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Components } from 'react-markdown'

const components: Components = {
  // Headings — keep them readable but not enormous inside a chat bubble
  h1: ({ children }) => <p className="font-bold text-sm mb-1.5 mt-1">{children}</p>,
  h2: ({ children }) => <p className="font-semibold text-sm mb-1 mt-1">{children}</p>,
  h3: ({ children }) => <p className="font-semibold text-sm mb-0.5 mt-1">{children}</p>,

  // Paragraphs
  p: ({ children }) => <p className="mb-1.5 last:mb-0 leading-relaxed">{children}</p>,

  // Inline emphasis
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,

  // Lists — properly indented with spacing
  ul: ({ children }) => <ul className="list-disc list-outside ml-4 my-1 space-y-0.5">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal list-outside ml-4 my-1 space-y-0.5">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed pl-0.5">{children}</li>,

  // Code
  pre: ({ children }) => (
    <pre className="bg-black/20 rounded-lg p-3 my-2 overflow-x-auto text-xs font-mono leading-relaxed whitespace-pre-wrap">
      {children}
    </pre>
  ),
  code: ({ children, className }) => {
    // block code has a language className; inline does not
    if (className) return <code className="font-mono text-xs">{children}</code>
    return <code className="bg-black/20 rounded px-1.5 py-0.5 font-mono text-xs">{children}</code>
  },

  // Horizontal rule
  hr: () => <hr className="border-current opacity-20 my-2" />,

  // Links
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 opacity-90 hover:opacity-100">
      {children}
    </a>
  ),

  // Block quote
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-current opacity-70 pl-3 my-1.5 italic">
      {children}
    </blockquote>
  ),
}

export default function Markdown({ content }: { content: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {content}
    </ReactMarkdown>
  )
}
